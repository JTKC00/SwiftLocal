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


_OFFICE_FILTER_MAP: dict[str, str] = {
    "docx": "MS Word 2007 XML",
    "xlsx": "Calc MS Excel 2007 XML",
    "pptx": "Impress MS PowerPoint 2007 XML",
    "odt": "writer8",
}

ALLOWED_PDF_TO_OFFICE_EXTENSIONS = frozenset(_OFFICE_FILTER_MAP.keys())


async def convert_pdf_to_office(input_paths: list[Path], output_dir: Path, extension: str) -> tuple[list[Path], list[str]]:
    tool = await tools_service.require_tool("libreOffice")
    clean_extension = sanitize_extension(extension or "docx")
    if clean_extension not in ALLOWED_PDF_TO_OFFICE_EXTENSIONS:
        raise ValueError(f"Unsupported Office extension: {clean_extension}. Allowed: {sorted(ALLOWED_PDF_TO_OFFICE_EXTENSIONS)}")
    filter_name = _OFFICE_FILTER_MAP[clean_extension]
    convert_to = f"{clean_extension}:{filter_name}"
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
            convert_to,
            "--outdir",
            str(output_dir),
            str(input_path),
        ]
        log = await run_process(str(tool["path"]), args, timeout=180)
        logs.append(log)
        outputs.append(output_dir / f"{input_path.stem}.{clean_extension}")

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


async def convert_image(input_paths: list[Path], output_dir: Path, extension: str) -> tuple[list[Path], list[str]]:
    fmt_map = {
        "jpg": "JPEG",
        "jpeg": "JPEG",
        "png": "PNG",
        "webp": "WEBP",
        "tiff": "TIFF",
        "tif": "TIFF",
        "bmp": "BMP",
        "gif": "GIF",
    }
    clean_ext = sanitize_extension(extension or "jpg")
    pil_format = fmt_map.get(clean_ext)
    if not pil_format:
        raise ValueError(f"Unsupported image format: {clean_ext}")

    outputs: list[Path] = []
    logs: list[str] = []
    for input_path in input_paths:
        output_path = output_dir / f"{input_path.stem}.{clean_ext}"
        try:
            await asyncio.to_thread(_convert_image_sync, input_path, output_path, pil_format)
        except Exception as error:
            raise RuntimeError(f"Image convert failed for {input_path.name}: {error}") from error
        if not output_path.exists():
            raise RuntimeError(f"Image convert finished but output was not created for {input_path.name}")
        outputs.append(output_path)
        logs.append(f"converted: {input_path.name} -> {output_path.name}")
    return outputs, logs


def _convert_image_sync(input_path: Path, output_path: Path, pil_format: str) -> None:
    try:
        from PIL import Image  # lazy import
    except ImportError as error:
        raise RuntimeError("Pillow is not installed") from error
    with Image.open(input_path) as img:
        if pil_format == "JPEG" and img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")
        img.save(output_path, format=pil_format)


async def merge_pdfs(input_paths: list[Path], output_dir: Path) -> tuple[list[Path], list[str]]:
    output_path = output_dir / "merged.pdf"
    await asyncio.to_thread(_merge_pdfs_sync, input_paths, output_path)
    if not output_path.exists():
        raise RuntimeError("PDF merge finished but output file was not created")
    return [output_path], [f"merged {len(input_paths)} file(s) -> {output_path.name}"]


def _merge_pdfs_sync(input_paths: list[Path], output_path: Path) -> None:
    try:
        from pypdf import PdfWriter  # lazy import
    except ImportError as error:
        raise RuntimeError("PDF merge failed: pypdf is not installed") from error
    writer = PdfWriter()
    for input_path in input_paths:
        writer.append(str(input_path))
    with open(output_path, "wb") as f:
        writer.write(f)


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
    input_path = input_paths[0]
    ranges = _parse_page_ranges(pages)
    if not ranges:
        raise ValueError("No valid page ranges provided (example: 1-3,5,7-9)")
    return await asyncio.to_thread(_split_pdf_sync, input_path, output_dir, ranges)


def _split_pdf_sync(input_path: Path, output_dir: Path, ranges: list[tuple[int, int]]) -> tuple[list[Path], list[str]]:
    try:
        from pypdf import PdfReader, PdfWriter  # lazy import
    except ImportError as error:
        raise RuntimeError("PDF split failed: pypdf is not installed") from error
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
    outputs: list[Path] = []
    logs: list[str] = []
    for input_path in input_paths:
        output_path = output_dir / f"{input_path.stem}_rotated.pdf"
        await asyncio.to_thread(_rotate_pdf_sync, input_path, output_path, angle)
        if not output_path.exists():
            raise RuntimeError(f"PDF rotate finished but output was not created for {input_path.name}")
        outputs.append(output_path)
        logs.append(f"rotated {input_path.name} by {angle}° -> {output_path.name}")
    return outputs, logs


def _rotate_pdf_sync(input_path: Path, output_path: Path, angle: int) -> None:
    try:
        from pypdf import PdfReader, PdfWriter  # lazy import
    except ImportError as error:
        raise RuntimeError("PDF rotate failed: pypdf is not installed") from error
    reader = PdfReader(str(input_path))
    writer = PdfWriter()
    for page in reader.pages:
        page.rotate(angle)
        writer.add_page(page)
    with open(output_path, "wb") as f:
        writer.write(f)


async def convert_pdf_to_docx(input_paths: list[Path], output_dir: Path) -> tuple[list[Path], list[str]]:
    logs: list[str] = []
    outputs: list[Path] = []

    for input_path in input_paths:
        output_path = output_dir / f"{input_path.stem}.docx"
        try:
            await asyncio.to_thread(_pdf_to_docx_sync, input_path, output_path)
        except Exception as error:
            raise RuntimeError(f"PDF to DOCX failed: {error}") from error
        if not output_path.exists():
            raise RuntimeError("PDF to DOCX finished but output file was not created")
        logs.append(f"converted: {input_path.name} -> {output_path.name}")
        outputs.append(output_path)

    return outputs, logs


def _pdf_to_docx_sync(input_path: Path, output_path: Path) -> None:
    from pdf2docx import Converter  # lazy import
    converter = Converter(str(input_path))
    converter.convert(str(output_path))
    converter.close()


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


async def encrypt_pdf(input_paths: list[Path], output_dir: Path, password: str) -> tuple[list[Path], list[str]]:
    outputs: list[Path] = []
    logs: list[str] = []
    for input_path in input_paths:
        output_path = output_dir / f"{input_path.stem}_encrypted.pdf"
        await asyncio.to_thread(_encrypt_pdf_sync, input_path, output_path, password)
        if not output_path.exists():
            raise RuntimeError(f"PDF encrypt finished but output was not created for {input_path.name}")
        outputs.append(output_path)
        logs.append(f"encrypted: {input_path.name} -> {output_path.name}")
    return outputs, logs


def _encrypt_pdf_sync(input_path: Path, output_path: Path, password: str) -> None:
    try:
        from pypdf import PdfReader, PdfWriter  # lazy import
    except ImportError as error:
        raise RuntimeError("PDF encrypt failed: pypdf is not installed") from error
    reader = PdfReader(str(input_path))
    if reader.is_encrypted:
        raise RuntimeError("PDF 已加密，請先解密後再重新加密")
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.encrypt(user_password=password)
    with open(output_path, "wb") as f:
        writer.write(f)


async def decrypt_pdf(input_paths: list[Path], output_dir: Path, password: str) -> tuple[list[Path], list[str]]:
    outputs: list[Path] = []
    logs: list[str] = []
    for input_path in input_paths:
        output_path = output_dir / f"{input_path.stem}_decrypted.pdf"
        await asyncio.to_thread(_decrypt_pdf_sync, input_path, output_path, password)
        if not output_path.exists():
            raise RuntimeError(f"PDF decrypt finished but output was not created for {input_path.name}")
        outputs.append(output_path)
        logs.append(f"decrypted: {input_path.name} -> {output_path.name}")
    return outputs, logs


def _decrypt_pdf_sync(input_path: Path, output_path: Path, password: str) -> None:
    try:
        from pypdf import PdfReader, PdfWriter  # lazy import
    except ImportError as error:
        raise RuntimeError("PDF decrypt failed: pypdf is not installed") from error
    reader = PdfReader(str(input_path))
    if reader.is_encrypted:
        result = reader.decrypt(password)
        if not result:
            raise RuntimeError("解密失敗：密碼不正確或加密格式不支援")
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    with open(output_path, "wb") as f:
        writer.write(f)


async def compress_pdf(input_paths: list[Path], output_dir: Path) -> tuple[list[Path], list[str]]:
    outputs: list[Path] = []
    logs: list[str] = []
    for input_path in input_paths:
        output_path = output_dir / f"{input_path.stem}_compressed.pdf"
        await asyncio.to_thread(_compress_pdf_sync, input_path, output_path)
        if not output_path.exists():
            raise RuntimeError(f"PDF compress finished but output was not created for {input_path.name}")
        outputs.append(output_path)
        logs.append(f"compressed: {input_path.name} -> {output_path.name}")
    return outputs, logs


def _compress_pdf_sync(input_path: Path, output_path: Path) -> None:
    try:
        from pypdf import PdfReader, PdfWriter  # lazy import
    except ImportError as error:
        raise RuntimeError("PDF compress failed: pypdf is not installed") from error
    reader = PdfReader(str(input_path))
    writer = PdfWriter()
    for page in reader.pages:
        page.compress_content_streams()
        writer.add_page(page)
    with open(output_path, "wb") as f:
        writer.write(f)
