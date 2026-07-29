import asyncio
import json
import os
import subprocess
import shutil
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
CONFIG_PATH = Path(os.environ.get("SWIFTLOCAL_TOOLS_CONFIG", ROOT_DIR / "tools.json"))


@dataclass(frozen=True)
class ToolDefinition:
    label: str
    env: str
    commands: tuple[str, ...]
    bundled_paths: tuple[tuple[str, ...], ...]
    windows_paths: tuple[str, ...]
    version_args: tuple[str, ...]


TOOL_DEFINITIONS = {
    "libreOffice": ToolDefinition(
        label="LibreOffice",
        env="SWIFTLOCAL_LIBREOFFICE",
        commands=("soffice.com", "soffice", "libreoffice"),
        bundled_paths=(
            ("libreoffice", "program", "soffice.com"),
            ("libreOffice", "program", "soffice.com"),
            ("LibreOffice", "program", "soffice.com"),
            ("libreoffice", "program", "soffice.exe"),
            ("libreOffice", "program", "soffice.exe"),
            ("LibreOffice", "program", "soffice.exe"),
            ("libreoffice", "program", "soffice"),
            ("libreOffice", "program", "soffice"),
            ("LibreOffice", "program", "soffice"),
        ),
        windows_paths=(
            r"C:\Program Files\LibreOffice\program\soffice.com",
            r"C:\Program Files\LibreOffice\program\soffice.exe",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.com",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        ),
        version_args=("--version",),
    ),
    "ffmpeg": ToolDefinition(
        label="FFmpeg",
        env="SWIFTLOCAL_FFMPEG",
        commands=("ffmpeg",),
        bundled_paths=(
            ("ffmpeg", "bin", "ffmpeg.exe"),
            ("ffmpeg", "ffmpeg.exe"),
            ("ffmpeg", "bin", "ffmpeg"),
            ("ffmpeg", "ffmpeg"),
        ),
        windows_paths=(
            r"C:\ffmpeg\bin\ffmpeg.exe",
            r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        ),
        version_args=("-version",),
    ),
    "tesseract": ToolDefinition(
        label="Tesseract",
        env="SWIFTLOCAL_TESSERACT",
        commands=("tesseract",),
        bundled_paths=(
            ("tesseract", "tesseract.exe"),
            ("tesseract", "bin", "tesseract.exe"),
            ("tesseract", "tesseract"),
            ("tesseract", "bin", "tesseract"),
        ),
        windows_paths=(
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ),
        version_args=("--version",),
    ),
    "qpdf": ToolDefinition(
        label="QPDF",
        env="SWIFTLOCAL_QPDF",
        commands=("qpdf",),
        bundled_paths=(
            ("qpdf", "bin", "qpdf.exe"),
            ("qpdf", "qpdf.exe"),
            ("qpdf", "bin", "qpdf"),
            ("qpdf", "qpdf"),
        ),
        windows_paths=(
            r"C:\Program Files\qpdf\bin\qpdf.exe",
            r"C:\Program Files (x86)\qpdf\bin\qpdf.exe",
        ),
        version_args=("--version",),
    ),
}


class ToolsService:
    def __init__(self, config_path: Path = CONFIG_PATH):
        self.config_path = config_path
        self.config = self._load_config()

    async def detect_tools(self) -> dict[str, dict[str, str | bool]]:
        entries = await asyncio.gather(
            *(self._detect_tool(key, definition) for key, definition in TOOL_DEFINITIONS.items())
        )
        tools = dict(entries)
        # Python package engines (bundled via backend/requirements.txt in Standard/Full builds).
        tools["pdf2docx"] = self._detect_pdf2docx()
        return tools

    def _detect_pdf2docx(self) -> dict[str, str | bool]:
        try:
            from .conversion_service import pdf2docx_status

            return pdf2docx_status()
        except Exception:
            try:
                import pdf2docx  # noqa: F401

                return {
                    "available": True,
                    "label": "PDF→DOCX 相容引擎",
                    "path": "",
                    "version": getattr(pdf2docx, "__version__", "") or "pdf2docx",
                    "source": "python",
                }
            except ImportError:
                return {
                    "available": False,
                    "label": "PDF→DOCX 相容引擎",
                    "path": "",
                    "version": "",
                    "source": "python",
                }

    async def set_tool_path(self, key: str, tool_path: str) -> dict[str, dict[str, str | bool]]:
        if key not in TOOL_DEFINITIONS:
            raise ValueError(f"Unknown tool: {key}")

        normalized = str(tool_path or "").strip()
        if normalized:
            path = Path(normalized)
            if not path.is_absolute():
                raise ValueError("Tool path must be absolute")
            if not path.exists():
                raise ValueError("Tool path does not exist")
            self.config["toolPaths"][key] = str(path)
        else:
            self.config["toolPaths"].pop(key, None)

        self._save_config()
        return await self.detect_tools()

    async def require_tool(self, key: str) -> dict[str, str | bool]:
        tools = await self.detect_tools()
        tool = tools.get(key)
        if not tool or not tool.get("available"):
            label = TOOL_DEFINITIONS[key].label if key in TOOL_DEFINITIONS else key
            raise RuntimeError(f"{label} not found")
        return tool

    async def _detect_tool(
        self, key: str, definition: ToolDefinition
    ) -> tuple[str, dict[str, str | bool]]:
        for candidate, source in self._build_candidates(key, definition):
            resolved = await self._resolve_candidate(candidate)
            if not resolved:
                continue
            normalized = self._normalize_tool_path(definition, resolved)
            version = await self._read_version(normalized, definition.version_args)
            entry: dict[str, str | bool] = {
                "available": True,
                "label": definition.label,
                "path": normalized,
                "version": version,
                "source": source,
                "message": "available",
            }
            if key == "tesseract":
                entry.update(await self._detect_tesseract_language_support(Path(normalized)))
                if entry["detectedLanguages"] and "chi_tra" not in entry["detectedLanguages"]:
                    entry["message"] = "available (missing chi_tra language pack)"
            return key, entry

        return key, {
            "available": False,
            "label": definition.label,
            "path": "",
            "version": "",
            "source": "",
            "message": "not found",
        }

    def _build_candidates(self, key: str, definition: ToolDefinition) -> list[tuple[str, str]]:
        candidates: list[tuple[str, str]] = []
        configured = self.config["toolPaths"].get(key)
        if configured:
            candidates.append((configured, "manual"))
        env_path = os.environ.get(definition.env)
        if env_path:
            candidates.append((env_path, "env"))
        for bundled_path in self._bundled_tool_paths(definition):
            candidates.append((str(bundled_path), "bundled"))
        if os.name == "nt":
            candidates.extend((item, "system") for item in definition.windows_paths)
        candidates.extend((item, "path") for item in definition.commands)
        return candidates

    def _bundled_tool_paths(self, definition: ToolDefinition) -> list[Path]:
        roots = [
            ROOT_DIR.parent / "tools",
            ROOT_DIR.parent / "resources" / "tools",
        ]
        paths: list[Path] = []
        for root in roots:
            for relative_path in definition.bundled_paths:
                paths.append(root.joinpath(*relative_path))
            paths.extend(self._find_bundled_executables(root, definition))
        unique_paths: list[Path] = []
        seen: set[Path] = set()
        for path in paths:
            if path in seen:
                continue
            seen.add(path)
            unique_paths.append(path)
        return unique_paths

    def _find_bundled_executables(self, root: Path, definition: ToolDefinition) -> list[Path]:
        if not root.exists():
            return []
        executable_names = {parts[-1] for parts in definition.bundled_paths}
        top_level_dirs = {parts[0] for parts in definition.bundled_paths}
        matches: list[Path] = []
        for dir_name in top_level_dirs:
            start_dir = root / dir_name
            if not start_dir.exists():
                continue
            matches.extend(self._walk_bundled_tool_dir(start_dir, executable_names, depth=4))
        matches.extend(self._walk_bundled_tool_dir(root, executable_names, depth=5))
        return matches

    def _walk_bundled_tool_dir(self, current_dir: Path, executable_names: set[str], depth: int) -> list[Path]:
        if depth < 0:
            return []
        matches: list[Path] = []
        try:
            entries = list(current_dir.iterdir())
        except OSError:
            return matches
        for entry in entries:
            if entry.is_file() and entry.name in executable_names:
                matches.append(entry)
                continue
            if entry.is_dir():
                matches.extend(self._walk_bundled_tool_dir(entry, executable_names, depth - 1))
        return matches

    async def _detect_tesseract_language_support(self, tool_path: Path) -> dict[str, str | bool | list[str]]:
        tessdata_path = self._resolve_tessdata_path(tool_path)
        env_prefix = os.environ.get("TESSDATA_PREFIX", "")
        base: dict[str, str | bool | list[str]] = {
            "tessdataPath": str(tessdata_path) if tessdata_path else "",
            "detectedLanguages": [],
            "detectionMethod": "none",
            "TESSDATA_PREFIX": env_prefix,
            "languages": "",
            "hasChiTra": False,
            "hasEng": False,
        }
        args = ["--list-langs"]
        if tessdata_path:
            args = ["--tessdata-dir", str(tessdata_path), "--list-langs"]
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                [str(tool_path), *args],
                capture_output=True,
                text=True,
                timeout=8,
                check=False,
            )
            if result.returncode == 0:
                languages = self._parse_tesseract_list_languages(f"{result.stdout or ''}\n{result.stderr or ''}")
                if languages:
                    return self._tesseract_language_entry(base, languages, "list-langs")
        except Exception:
            pass
        scanned = self._scan_tessdata_languages(tessdata_path)
        return self._tesseract_language_entry(base, scanned, "traineddata-scan" if scanned else "none")

    def _tesseract_language_entry(
        self,
        base: dict[str, str | bool | list[str]],
        languages: list[str],
        detection_method: str,
    ) -> dict[str, str | bool | list[str]]:
        detected = sorted(set(languages))
        return {
            **base,
            "detectedLanguages": detected,
            "detectionMethod": detection_method,
            "languages": ",".join(detected),
            "hasChiTra": "chi_tra" in detected,
            "hasEng": "eng" in detected,
        }

    def _parse_tesseract_list_languages(self, output: str) -> list[str]:
        languages: list[str] = []
        for line in str(output or "").splitlines():
            item = line.strip()
            if not item or item.lower().startswith("list of available languages"):
                continue
            if all(char.isalnum() or char in "_+-" for char in item):
                languages.append(item)
        return sorted(set(languages))

    def _resolve_tessdata_path(self, tool_path: Path) -> Path | None:
        try:
            from .conversion_service import resolve_tessdata_dir
        except Exception:
            resolve_tessdata_dir = None  # type: ignore[assignment]
        tessdata_dir = None
        if resolve_tessdata_dir:
            tessdata_dir = resolve_tessdata_dir(tool_path)
        if tessdata_dir is None:
            exe_dir = tool_path.resolve().parent
            for candidate in (
                exe_dir / "tessdata",
                exe_dir / "share" / "tessdata",
                exe_dir.parent / "tessdata",
                exe_dir.parent / "share" / "tessdata",
            ):
                if candidate.is_dir():
                    tessdata_dir = candidate
                    break
        if tessdata_dir is not None and tessdata_dir.is_dir():
            return tessdata_dir
        env_prefix = os.environ.get("TESSDATA_PREFIX", "").strip()
        if env_prefix:
            for candidate in (Path(env_prefix), Path(env_prefix) / "tessdata"):
                if candidate.is_dir():
                    return candidate
        return None

    def _scan_tessdata_languages(self, tessdata_dir: Path | None) -> list[str]:
        """List *.traineddata basenames from tessdata as fallback only."""
        if tessdata_dir is None or not tessdata_dir.is_dir():
            return []
        langs: list[str] = []
        try:
            for entry in tessdata_dir.iterdir():
                if not entry.is_file():
                    continue
                name = entry.name
                if not name.endswith(".traineddata"):
                    continue
                try:
                    if entry.stat().st_size < 50_000:
                        continue
                except OSError:
                    continue
                langs.append(name[: -len(".traineddata")])
        except OSError:
            return []
        return sorted(langs)

    async def _resolve_candidate(self, candidate: str) -> str:
        path = Path(candidate)
        if path.is_absolute():
            return str(path) if path.exists() else ""
        return shutil.which(candidate) or ""

    def _normalize_tool_path(self, definition: ToolDefinition, resolved: str) -> str:
        if os.name != "nt" or definition.label != "LibreOffice":
            return resolved
        if not resolved.lower().endswith("soffice.exe"):
            return resolved
        console_path = Path(resolved[:-4] + ".com")
        return str(console_path) if console_path.exists() else resolved

    async def _read_version(self, executable: str, args: tuple[str, ...]) -> str:
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                [executable, *args],
                capture_output=True,
                text=True,
                timeout=8,
                check=False,
            )
            text = f"{result.stdout or ''}{result.stderr or ''}".strip()
            return next((line.strip() for line in text.splitlines() if line.strip()), "")
        except Exception as error:
            return str(error)

    def _load_config(self) -> dict[str, dict[str, str]]:
        try:
            parsed = json.loads(self.config_path.read_text(encoding="utf-8"))
            tool_paths = parsed.get("toolPaths", {})
            if isinstance(tool_paths, dict):
                return {"toolPaths": {str(k): str(v) for k, v in tool_paths.items()}}
        except Exception:
            pass
        return {"toolPaths": {}}

    def _save_config(self) -> None:
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.config_path.write_text(json.dumps(self.config, ensure_ascii=False, indent=2), encoding="utf-8")


tools_service = ToolsService()
