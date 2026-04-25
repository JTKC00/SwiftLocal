import asyncio
from pathlib import Path

from .tools_service import tools_service


async def convert_office_to_pdf(input_paths: list[Path], output_dir: Path) -> tuple[list[Path], list[str]]:
    tool = await tools_service.require_tool("libreOffice")
    logs: list[str] = []
    outputs: list[Path] = []

    for input_path in input_paths:
        args = ["--headless", "--convert-to", "pdf", "--outdir", str(output_dir), str(input_path)]
        log = await run_process(str(tool["path"]), args)
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
        log = await run_process(str(tool["path"]), ["-y", "-i", str(input_path), str(output_path)])
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
        log = await run_process(str(tool["path"]), [str(input_path), str(output_base), "-l", clean_language])
        logs.append(log)
        outputs.append(output_base.with_suffix(".txt"))

    return outputs, logs


async def run_process(executable: str, args: list[str]) -> str:
    process = await asyncio.create_subprocess_exec(
        executable,
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    output = (stdout + stderr).decode(errors="replace").strip()
    if process.returncode != 0:
        raise RuntimeError(output or f"Process exited with code {process.returncode}")
    return output


def sanitize_extension(extension: str) -> str:
    clean = "".join(char for char in extension.lower() if char.isalnum())
    if not clean:
        raise ValueError("Invalid output extension")
    return clean
