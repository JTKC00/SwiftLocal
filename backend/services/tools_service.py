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
        commands=("soffice", "libreoffice"),
        bundled_paths=(
            ("libreoffice", "program", "soffice.exe"),
            ("libreOffice", "program", "soffice.exe"),
            ("LibreOffice", "program", "soffice.exe"),
            ("libreoffice", "program", "soffice"),
            ("libreOffice", "program", "soffice"),
            ("LibreOffice", "program", "soffice"),
        ),
        windows_paths=(
            r"C:\Program Files\LibreOffice\program\soffice.exe",
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
        return dict(entries)

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
            version = await self._read_version(resolved, definition.version_args)
            return key, {
                "available": True,
                "label": definition.label,
                "path": resolved,
                "version": version,
                "source": source,
                "message": "available",
            }

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
        return paths

    async def _resolve_candidate(self, candidate: str) -> str:
        path = Path(candidate)
        if path.is_absolute():
            return str(path) if path.exists() else ""
        return shutil.which(candidate) or ""

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
