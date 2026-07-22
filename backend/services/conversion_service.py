import asyncio
import re
import subprocess
from contextvars import ContextVar
from pathlib import Path

from .tools_service import tools_service

# Job cancellation: set by JobService, checked/killed inside run_process.
_current_job_id: ContextVar[str | None] = ContextVar("swiftlocal_job_id", default=None)
_cancel_requested: dict[str, bool] = {}
_active_processes: dict[str, subprocess.Popen] = {}


class JobCancelled(Exception):
    """Raised when a job is cancelled by the user."""


def begin_job(job_id: str) -> None:
    _cancel_requested[job_id] = False
    _current_job_id.set(job_id)


def end_job(job_id: str) -> None:
    _cancel_requested.pop(job_id, None)
    _active_processes.pop(job_id, None)
    if _current_job_id.get() == job_id:
        _current_job_id.set(None)


def request_cancel(job_id: str) -> bool:
    """Mark job cancelled and kill its external process if any. Returns True if process was signalled."""
    _cancel_requested[job_id] = True
    proc = _active_processes.get(job_id)
    if not proc or proc.poll() is not None:
        return False
    try:
        proc.kill()
    except OSError:
        return False
    return True


def ensure_not_cancelled() -> None:
    job_id = _current_job_id.get()
    if job_id and _cancel_requested.get(job_id):
        raise JobCancelled("任務已取消")


async def convert_office_to_pdf(input_paths: list[Path], output_dir: Path) -> tuple[list[Path], list[str]]:
    tool = await tools_service.require_tool("libreOffice")
    logs: list[str] = []
    outputs: list[Path] = []

    for input_path in input_paths:
        ensure_not_cancelled()
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
        before = snapshot_output_dir(output_dir)
        log = await run_process(str(tool["path"]), args, timeout=180)
        output_path = resolve_libreoffice_output(output_dir, input_path, "pdf", before)
        logs.append(log or f"converted: {input_path.name} -> {output_path.name}")
        outputs.append(output_path)

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
        ensure_not_cancelled()
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
        before = snapshot_output_dir(output_dir)
        log = await run_process(str(tool["path"]), args, timeout=180)
        output_path = resolve_libreoffice_output(output_dir, input_path, clean_extension, before)
        logs.append(log or f"converted: {input_path.name} -> {output_path.name}")
        outputs.append(output_path)

    return outputs, logs


def snapshot_output_dir(output_dir: Path) -> dict[str, tuple[int, int]]:
    """Capture name -> (mtime_ns, size) for files currently in the output dir."""
    snap: dict[str, tuple[int, int]] = {}
    try:
        entries = list(output_dir.iterdir())
    except OSError:
        return snap
    for entry in entries:
        if not entry.is_file():
            continue
        try:
            stat = entry.stat()
            snap[entry.name] = (stat.st_mtime_ns, stat.st_size)
        except OSError:
            continue
    return snap


def resolve_libreoffice_output(
    output_dir: Path,
    input_path: Path,
    extension: str,
    before: dict[str, tuple[int, int]],
) -> Path:
    """
    LibreOffice usually writes {stem}.{ext}, but special characters / multi-dot
    names can produce a different basename. Prefer the expected name, else pick
    a newly created/updated file with the target extension.
    """
    clean_ext = extension.lower().lstrip(".")
    expected_name = f"{input_path.stem}.{clean_ext}"
    expected_path = output_dir / expected_name

    def is_new_or_updated(path: Path) -> bool:
        try:
            stat = path.stat()
        except OSError:
            return False
        prev = before.get(path.name)
        current = (stat.st_mtime_ns, stat.st_size)
        return prev is None or prev != current

    if expected_path.is_file() and (is_new_or_updated(expected_path) or expected_name not in before):
        return expected_path

    candidates: list[Path] = []
    try:
        entries = list(output_dir.iterdir())
    except OSError as error:
        raise RuntimeError(f"LibreOffice 輸出目錄無法讀取：{output_dir}") from error

    for entry in entries:
        if not entry.is_file():
            continue
        if entry.suffix.lower().lstrip(".") != clean_ext:
            continue
        if entry.name.lower().endswith(f"_lo_profile.{clean_ext}"):
            continue
        if is_new_or_updated(entry):
            candidates.append(entry)

    if not candidates and expected_path.is_file():
        # Conversion may rewrite identical content with same mtime resolution.
        return expected_path

    if not candidates:
        raise RuntimeError(
            f"LibreOffice 轉換完成但找不到輸出檔（預期 {expected_name}）。"
            f" 輸入：{input_path.name}"
        )

    # Prefer same stem (case-insensitive), then stem contained in name, then newest.
    stem_lower = input_path.stem.lower()
    same_stem = [p for p in candidates if p.stem.lower() == stem_lower]
    if same_stem:
        return max(same_stem, key=lambda p: p.stat().st_mtime_ns)

    partial = [p for p in candidates if stem_lower in p.stem.lower() or p.stem.lower() in stem_lower]
    if partial:
        return max(partial, key=lambda p: p.stat().st_mtime_ns)

    return max(candidates, key=lambda p: p.stat().st_mtime_ns)


_AUDIO_ONLY_EXTENSIONS = frozenset({"mp3", "wav", "m4a", "flac", "aac", "ogg", "opus"})


async def convert_media(
    input_paths: list[Path],
    output_dir: Path,
    extension: str,
    media_options: dict[str, str] | None = None,
) -> tuple[list[Path], list[str]]:
    tool = await tools_service.require_tool("ffmpeg")
    clean_extension = sanitize_extension(extension or "mp4")
    options = dict(media_options or {})
    options["extension"] = clean_extension
    logs: list[str] = []
    outputs: list[Path] = []

    for input_path in input_paths:
        ensure_not_cancelled()
        output_path = output_dir / f"{input_path.stem}.{clean_extension}"
        args = build_ffmpeg_media_args(input_path, output_path, options)
        log = await run_process(str(tool["path"]), args, timeout=600)
        logs.append(log or f"media: {input_path.name} -> {output_path.name}")
        outputs.append(output_path)

    return outputs, logs


def sanitize_media_bitrate(value: str, field_name: str) -> str:
    text = (value or "").strip().lower().replace(" ", "")
    if not text:
        return ""
    # e.g. 128k, 2m, 1500k, 64
    if not re.fullmatch(r"\d{1,7}([kmg])?", text):
        raise ValueError(f"Invalid {field_name}: use values like 128k or 2M")
    return text


def sanitize_media_scale(value: str) -> str:
    text = (value or "").strip().replace(" ", "")
    if not text:
        return ""
    # 1280:720, -2:720, 1280:-2, iw/2:ih/2 (limited: digits, :, -, *)
    if not re.fullmatch(r"-?\d{1,5}:-?\d{1,5}", text):
        raise ValueError("Invalid scale: use W:H such as 1280:720 or -2:720")
    return text


def sanitize_media_crop(value: str) -> str:
    text = (value or "").strip().replace(" ", "")
    if not text:
        return ""
    # w:h:x:y
    if not re.fullmatch(r"\d{1,5}:\d{1,5}:\d{1,5}:\d{1,5}", text):
        raise ValueError("Invalid crop: use w:h:x:y (example 640:360:0:0)")
    return text


def sanitize_media_time(value: str, field_name: str) -> str:
    text = (value or "").strip().replace(" ", "")
    if not text:
        return ""
    # seconds or HH:MM:SS(.ms)
    if re.fullmatch(r"\d+(\.\d+)?", text):
        return text
    if re.fullmatch(r"\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?", text):
        return text
    raise ValueError(f"Invalid {field_name}: use seconds or HH:MM:SS")


def sanitize_gif_fps(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    try:
        fps = int(text)
    except ValueError as error:
        raise ValueError("gifFps must be an integer") from error
    if fps < 1 or fps > 30:
        raise ValueError("gifFps must be between 1 and 30")
    return str(fps)


def build_ffmpeg_media_args(input_path: Path, output_path: Path, options: dict[str, str]) -> list[str]:
    """Build ffmpeg argv (without executable) for media conversion."""
    extension = sanitize_extension(options.get("extension") or "mp4")
    start = sanitize_media_time(options.get("start") or "", "start")
    duration = sanitize_media_time(options.get("duration") or "", "duration")
    video_bitrate = sanitize_media_bitrate(options.get("videoBitrate") or "", "videoBitrate")
    audio_bitrate = sanitize_media_bitrate(options.get("audioBitrate") or "", "audioBitrate")
    scale = sanitize_media_scale(options.get("scale") or "")
    crop = sanitize_media_crop(options.get("crop") or "")
    gif_fps = sanitize_gif_fps(options.get("gifFps") or "")

    args: list[str] = ["-y"]
    if start:
        args.extend(["-ss", start])
    args.extend(["-i", str(input_path)])
    if duration:
        args.extend(["-t", duration])

    video_filters: list[str] = []
    if crop:
        video_filters.append(f"crop={crop}")
    if scale:
        video_filters.append(f"scale={scale}")

    if extension == "gif":
        fps = gif_fps or "10"
        video_filters.append(f"fps={fps}")
        # Simple high-quality-ish gif pipeline without palettegen (portable).
        if video_filters:
            args.extend(["-vf", ",".join(video_filters)])
        args.extend(["-loop", "0", str(output_path)])
        return args

    if extension in _AUDIO_ONLY_EXTENSIONS:
        args.append("-vn")
        if audio_bitrate and extension not in {"wav", "flac"}:
            args.extend(["-b:a", audio_bitrate])
        # codec hints for common formats
        if extension == "mp3":
            args.extend(["-codec:a", "libmp3lame"])
        elif extension == "aac" or extension == "m4a":
            args.extend(["-codec:a", "aac"])
        args.append(str(output_path))
        return args

    # Video containers (mp4, webm, mov, mkv, ...)
    if video_filters:
        args.extend(["-vf", ",".join(video_filters)])
    if video_bitrate:
        args.extend(["-b:v", video_bitrate])
    if audio_bitrate:
        args.extend(["-b:a", audio_bitrate])
    if extension == "mp4":
        args.extend(["-movflags", "+faststart"])
    args.append(str(output_path))
    return args


async def ocr_images(input_paths: list[Path], output_dir: Path, language: str) -> tuple[list[Path], list[str]]:
    tool = await tools_service.require_tool("tesseract")
    clean_language = (language or "eng").strip() or "eng"
    logs: list[str] = []
    outputs: list[Path] = []
    tessdata_dir = resolve_tessdata_dir(Path(str(tool["path"])))

    for input_path in input_paths:
        ensure_not_cancelled()
        output_base = output_dir / f"{input_path.stem}_ocr"
        args = [str(input_path), str(output_base), "-l", clean_language]
        if tessdata_dir:
            args.extend(["--tessdata-dir", str(tessdata_dir)])
        log = await run_process(str(tool["path"]), args, timeout=300)
        logs.append(log)
        outputs.append(output_base.with_suffix(".txt"))

    return outputs, logs


OCR_PDF_MAX_PAGES_DEFAULT = 50
OCR_PDF_MAX_PAGES_HARD_LIMIT = 100
OCR_PDF_RENDER_SCALE = 2.0


async def ocr_pdf(
    input_paths: list[Path],
    output_dir: Path,
    language: str,
    max_pages: int = OCR_PDF_MAX_PAGES_DEFAULT,
) -> tuple[list[Path], list[str]]:
    """Rasterize PDF pages then OCR each page with Tesseract; one TXT per PDF."""
    tool = await tools_service.require_tool("tesseract")
    clean_language = (language or "eng").strip() or "eng"
    page_limit = max(1, min(int(max_pages or OCR_PDF_MAX_PAGES_DEFAULT), OCR_PDF_MAX_PAGES_HARD_LIMIT))
    logs: list[str] = []
    outputs: list[Path] = []
    tessdata_dir = resolve_tessdata_dir(Path(str(tool["path"])))

    for input_path in input_paths:
        ensure_not_cancelled()
        require_unencrypted_pdf(input_path)
        page_dir = output_dir / f"{input_path.stem}_ocr_pages"
        page_dir.mkdir(parents=True, exist_ok=True)
        try:
            page_images, render_log = await asyncio.to_thread(
                _render_pdf_pages_sync, input_path, page_dir, page_limit, OCR_PDF_RENDER_SCALE
            )
        except Exception as error:
            raise RuntimeError(f"PDF OCR 渲染失敗（{input_path.name}）：{error}") from error
        logs.append(render_log)
        if not page_images:
            raise RuntimeError(f"PDF 沒有可 OCR 的頁面：{input_path.name}")

        page_texts: list[str] = []
        for index, image_path in enumerate(page_images, start=1):
            ensure_not_cancelled()
            page_base = page_dir / f"page_{index:03d}_ocr"
            args = [str(image_path), str(page_base), "-l", clean_language]
            if tessdata_dir:
                args.extend(["--tessdata-dir", str(tessdata_dir)])
            log = await run_process(str(tool["path"]), args, timeout=300)
            if log:
                logs.append(log)
            text_path = page_base.with_suffix(".txt")
            text = text_path.read_text(encoding="utf-8", errors="replace") if text_path.exists() else ""
            page_texts.append(f"--- Page {index} ---\n{text.strip()}")

        combined = "\n\n".join(page_texts).strip() + "\n"
        output_path = output_dir / f"{input_path.stem}_ocr.txt"
        output_path.write_text(combined, encoding="utf-8")
        outputs.append(output_path)
        logs.append(f"ocr-pdf: {input_path.name} -> {output_path.name} ({len(page_images)} page(s))")

    return outputs, logs


def _render_pdf_pages_sync(
    input_path: Path,
    page_dir: Path,
    max_pages: int,
    scale: float,
) -> tuple[list[Path], str]:
    try:
        import pypdfium2 as pdfium  # lazy import
    except ImportError as error:
        raise RuntimeError("PDF OCR 需要 pypdfium2，請執行 pip install pypdfium2") from error

    doc = pdfium.PdfDocument(str(input_path))
    try:
        total = len(doc)
        if total == 0:
            return [], f"render: {input_path.name} has 0 pages"
        limit = min(total, max_pages)
        images: list[Path] = []
        for index in range(limit):
            ensure_not_cancelled()
            page = doc[index]
            bitmap = page.render(scale=scale)
            pil_image = bitmap.to_pil()
            image_path = page_dir / f"page_{index + 1:03d}.png"
            pil_image.save(image_path, format="PNG")
            images.append(image_path)
        note = f"render: {input_path.name} {limit}/{total} page(s) @ scale={scale}"
        if total > max_pages:
            note += f" (truncated at {max_pages})"
        return images, note
    finally:
        doc.close()


def resolve_tessdata_dir(tool_path: Path) -> Path | None:
    """Locate tessdata next to a portable/bundled Tesseract install."""
    exe_dir = tool_path.resolve().parent
    candidates = [
        exe_dir / "tessdata",
        exe_dir / "share" / "tessdata",
        exe_dir.parent / "tessdata",
        exe_dir.parent / "share" / "tessdata",
    ]
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    return None


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


def encrypted_pdf_error(name: str) -> RuntimeError:
    return RuntimeError(f"「{name}」已加密，請先使用「PDF 解密」後再處理")


def require_unencrypted_pdf(input_path: Path) -> None:
    """Raise a clear error if the PDF is encrypted (operations that need open content)."""
    try:
        from pypdf import PdfReader  # lazy import
    except ImportError:
        return
    try:
        reader = PdfReader(str(input_path))
    except Exception as error:
        detail = str(error)
        if re_search_encrypted(detail):
            raise encrypted_pdf_error(input_path.name) from error
        raise RuntimeError(f"無法讀取 PDF「{input_path.name}」：{detail}") from error
    if getattr(reader, "is_encrypted", False):
        raise encrypted_pdf_error(input_path.name)


def re_search_encrypted(message: str) -> bool:
    text = (message or "").lower()
    return "encrypt" in text or "password" in text or "加密" in text or "密碼" in text


def _merge_pdfs_sync(input_paths: list[Path], output_path: Path) -> None:
    try:
        from pypdf import PdfWriter  # lazy import
    except ImportError as error:
        raise RuntimeError("PDF merge failed: pypdf is not installed") from error
    writer = PdfWriter()
    for input_path in input_paths:
        require_unencrypted_pdf(input_path)
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
    require_unencrypted_pdf(input_path)
    reader = PdfReader(str(input_path))
    total = len(reader.pages)
    if total == 0:
        raise ValueError("PDF has no pages")
    outputs: list[Path] = []
    logs: list[str] = []
    for i, (start, end) in enumerate(ranges, 1):
        writer = PdfWriter()
        for page_num in range(start - 1, end):
            if 0 <= page_num < total:
                writer.add_page(reader.pages[page_num])
        if len(writer.pages) == 0:
            # Skip empty ranges entirely (out of bounds) instead of writing blank PDFs.
            logs.append(f"split part {i}: skipped pages {start if start == end else f'{start}-{end}'} (outside 1-{total})")
            continue
        actual_start = start
        actual_end = min(end, total)
        label = str(actual_start) if actual_start == actual_end else f"{actual_start}-{actual_end}"
        output_path = output_dir / f"{input_path.stem}_p{label}.pdf"
        with open(output_path, "wb") as f:
            writer.write(f)
        outputs.append(output_path)
        logs.append(f"split part {i}: pages {label} -> {output_path.name}")
    if not outputs:
        raise ValueError(f"No valid pages found in ranges (PDF has {total} page(s); example: 1-3,5)")
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
    require_unencrypted_pdf(input_path)
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
    require_unencrypted_pdf(input_path)
    from pdf2docx import Converter  # lazy import
    converter = Converter(str(input_path))
    converter.convert(str(output_path))
    converter.close()


async def run_process(executable: str, args: list[str], timeout: int = 300) -> str:
    ensure_not_cancelled()
    job_id = _current_job_id.get()
    return await asyncio.to_thread(_run_process_sync, executable, args, timeout, job_id)


def _run_process_sync(executable: str, args: list[str], timeout: int, job_id: str | None) -> str:
    if job_id and _cancel_requested.get(job_id):
        raise JobCancelled("任務已取消")
    proc = subprocess.Popen(
        [executable, *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if job_id:
        _active_processes[job_id] = proc
    try:
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, stderr = proc.communicate()
            output = f"{stdout or ''}{stderr or ''}".strip()
            raise RuntimeError(output or f"Process timed out after {timeout}s") from None
    finally:
        if job_id:
            _active_processes.pop(job_id, None)

    output = f"{stdout or ''}{stderr or ''}".strip()
    if job_id and _cancel_requested.get(job_id):
        raise JobCancelled("任務已取消")
    if proc.returncode != 0:
        raise RuntimeError(output or f"Process exited with code {proc.returncode}")
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
    require_unencrypted_pdf(input_path)
    reader = PdfReader(str(input_path))
    writer = PdfWriter()
    for page in reader.pages:
        page.compress_content_streams()
        writer.add_page(page)
    with open(output_path, "wb") as f:
        writer.write(f)
