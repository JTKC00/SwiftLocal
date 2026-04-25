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


async def merge_pdfs(input_paths: list[Path], output_dir: Path) -> tuple[list[Path], list[str]]:
    try:
        from pypdf import PdfWriter  # lazy import
    except ImportError as error:
        raise RuntimeError("PDF merge failed: pypdf is not installed") from error

    writer = PdfWriter()
    for input_path in input_paths:
        writer.append(str(input_path))
    output_path = output_dir / "merged.pdf"
    with open(output_path, "wb") as f:
        writer.write(f)
    if not output_path.exists():
        raise RuntimeError("PDF merge finished but output file was not created")
    return [output_path], [f"merged {len(input_paths)} file(s) -> {output_path.name}"]


def _parse_page_ranges(pages: str) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    for part in pages.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, _, b = part.partition("-")
            try:
                start, end = int(a.strip()), int(b.strip())
                if start > 0 and end >= start:
                    ranges.append((start, end))
            except ValueError:
                pass
        else:
            try:
                n = int(part)
                if n > 0:
                    ranges.append((n, n))
            except ValueError:
                pass
    return ranges


async def split_pdf(input_paths: list[Path], output_dir: Path, pages: str) -> tuple[list[Path], list[str]]:
    if len(input_paths) != 1:
        raise ValueError("PDF split requires exactly one input file")
    try:
        from pypdf import PdfReader, PdfWriter  # lazy import
    except ImportError as error:
        raise RuntimeError("PDF split failed: pypdf is not installed") from error

    input_path = input_paths[0]
    ranges = _parse_page_ranges(pages)
    if not ranges:
        raise ValueError("No valid page ranges provided (example: 1-3,5,7-9)")

    reader = PdfReader(str(input_path))
    total = len(reader.pages)
    outputs: list[Path] = []
    logs: list[str] = []
    for i, (start, end) in enumerate(ranges, 1):
        writer = PdfWriter()
        for page_num in range(start - 1, end):
            if page_num < total:
                writer.add_page(reader.pages[page_num])
        label = str(start) if start == end else f"{start}-{end}"
        output_path = output_dir / f"{input_path.stem}_p{label}.pdf"
        with open(output_path, "wb") as f:
            writer.write(f)
        outputs.append(output_path)
        logs.append(f"split part {i}: pages {label} -> {output_path.name}")
    return outputs, logs


async def rotate_pdf(input_paths: list[Path], output_dir: Path, angle: int) -> tuple[list[Path], list[str]]:
    try:
        from pypdf import PdfReader, PdfWriter  # lazy import
    except ImportError as error:
        raise RuntimeError("PDF rotate failed: pypdf is not installed") from error

    outputs: list[Path] = []
    logs: list[str] = []
    for input_path in input_paths:
        reader = PdfReader(str(input_path))
        writer = PdfWriter()
        for page in reader.pages:
            page.rotate(angle)
            writer.add_page(page)
        output_path = output_dir / f"{input_path.stem}_rotated.pdf"
        with open(output_path, "wb") as f:
            writer.write(f)
        if not output_path.exists():
            raise RuntimeError(f"PDF rotate finished but output was not created for {input_path.name}")
        outputs.append(output_path)
        logs.append(f"rotated {input_path.name} by {angle}° -> {output_path.name}")
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
