import asyncio
import subprocess
from pathlib import Path

from .tools_service import tools_service


async def convert_office_to_pdf(input_paths: list[Path], output_dir: Path) -> tuple[list[Path], list[str]]:
    tool = await tools_service.require_tool("libreOffice")
    logs: list[str] = []
    outputs: list[Path] = []

    for input_path in input_paths:
        profile_dir = output_dir / f"{input_path.stem}_lo_profile"
        profile_dir.mkdir(parents=True, exist_ok=True)
        profile_uri = profile_dir.resolve().as_posix()
        args = [
            "--headless",
            "--nologo",
            "--nodefault",
            "--norestore",
            "--nolockcheck",
            f"-env:UserInstallation=file:///{profile_uri}",
            "--convert-to",
            "pdf",
            "--outdir",
            str(output_dir),
            str(input_path),
        ]
        log = await run_process(str(tool["path"]), args, timeout=180)
        logs.append(log)
        outputs.append(output_dir / f"{input_path.stem}.pdf")

    return outputs, logs


async def convert_media(input_paths: list[Path], output_dir: Path, extension: str) -> tuple[list[Path], list[str]]:
    tool = await tools_service.require_tool("ffmpeg")
    clean_extension = sanitize_extension(extension or "mp4")
    logs: list[str] = []
    outputs: list[Path] = []

    for input_path in input_paths:
        output_path = output_dir / f"{input_path.stem}.{clean_extension}"
        log = await run_process(str(tool["path"]), ["-y", "-i", str(input_path), str(output_path)], timeout=600)
        logs.append(log)
        outputs.append(output_path)

    return outputs, logs


async def ocr_images(input_paths: list[Path], output_dir: Path, language: str) -> tuple[list[Path], list[str]]:
    tool = await tools_service.require_tool("tesseract")
    clean_language = (language or "eng").strip() or "eng"
    logs: list[str] = []
    outputs: list[Path] = []

    for input_path in input_paths:
        output_base = output_dir / f"{input_path.stem}_ocr"
        log = await run_process(str(tool["path"]), [str(input_path), str(output_base), "-l", clean_language], timeout=300)
        logs.append(log)
        outputs.append(output_base.with_suffix(".txt"))

    return outputs, logs


async def convert_pdf_to_docx(input_paths: list[Path], output_dir: Path) -> tuple[list[Path], list[str]]:
    logs: list[str] = []
    outputs: list[Path] = []

    for input_path in input_paths:
        output_path = output_dir / f"{input_path.stem}.docx"
        try:
            from pdf2docx import Converter  # lazy import
            converter = Converter(str(input_path))
            converter.convert(str(output_path))
            converter.close()
        except Exception as error:
            raise RuntimeError(f"PDF to DOCX failed: {error}") from error
        if not output_path.exists():
            raise RuntimeError("PDF to DOCX finished but output file was not created")
        logs.append(f"converted: {input_path.name} -> {output_path.name}")
        outputs.append(output_path)

    return outputs, logs


async def run_process(executable: str, args: list[str], timeout: int = 300) -> str:
    result = await asyncio.to_thread(
        subprocess.run,
        [executable, *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    output = f"{result.stdout or ''}{result.stderr or ''}".strip()
    if result.returncode != 0:
        raise RuntimeError(output or f"Process exited with code {result.returncode}")
    return output


def sanitize_extension(extension: str) -> str:
    clean = "".join(char for char in extension.lower() if char.isalnum())
    if not clean:
        raise ValueError("Invalid output extension")
    return clean
