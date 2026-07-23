import asyncio
import re
import shutil
import subprocess
import zipfile
from contextvars import ContextVar
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

from .tools_service import tools_service

# Windows STATUS_STACK_BUFFER_OVERRUN / fail-fast abort (ucrtbase.dll).
# Unsigned decimal 3221226505 == signed -1073740791 == 0xC0000409.
WIN_STATUS_STACK_BUFFER_OVERRUN = 0xC0000409
WIN_STATUS_STACK_BUFFER_OVERRUN_SIGNED = -1073740791
WIN_STATUS_STACK_BUFFER_OVERRUN_UNSIGNED = 3221226505

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
        if profile_dir.exists():
            cleanup_lo_profile(profile_dir)
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
        try:
            log = await run_process(str(tool["path"]), args, timeout=180, tool_label="LibreOffice")
            output_path = resolve_libreoffice_output(output_dir, input_path, "pdf", before)
            logs.append(log or f"converted: {input_path.name} -> {output_path.name}")
            outputs.append(output_path)
        finally:
            cleanup_lo_profile(profile_dir)

    return outputs, logs


_OFFICE_FILTER_MAP: dict[str, str] = {
    "docx": "MS Word 2007 XML",
    "xlsx": "Calc MS Excel 2007 XML",
    "pptx": "Impress MS PowerPoint 2007 XML",
    "odt": "writer8",
}

ALLOWED_PDF_TO_OFFICE_EXTENSIONS = frozenset(_OFFICE_FILTER_MAP.keys())

OCR_PDF_MAX_PAGES_DEFAULT = 50
OCR_PDF_MAX_PAGES_HARD_LIMIT = 100
OCR_PDF_RENDER_SCALE = 2.0


DOCX_FALLBACK_LOG = (
    "LibreOffice 無法完成轉換，已改用相容模式建立 DOCX；版面可能與原 PDF 不完全一致。"
)
DOCX_COMPAT_DIRECT_LOG = (
    "已依設定直接使用相容模式建立 DOCX（略過 LibreOffice）；版面可能與原 PDF 不完全一致。"
)
DOCX_FALLBACK_MISSING_ENGINE = (
    "LibreOffice 無法完成轉換，而且 PDF→DOCX 相容引擎未安裝。"
    "請安裝 backend/requirements.txt 後重試。"
)
DOCX_SCAN_OCR_HINT = (
    "此 PDF 可抽取文字很少（可能是掃描件）。若 DOCX 幾乎空白，"
    "請改用「掃描 PDF → OCR 文字」後再處理，或先以 OCR 建立可搜尋 PDF。"
)
DOCX_OCR_PIPELINE_LOG = (
    "已使用 OCR→DOCX 管線建立文件（掃描／低文字 PDF）；內容為純文字段落，版面與原圖不同。"
)
DOCX_SEARCHABLE_OCR_LOG = (
    "已先建立可搜尋 PDF（OCR 文字層），再匯出 DOCX；並保留 *_ocr_searchable.pdf 中間產物。"
)
EXPERIMENTAL_OFFICE_NOTE = (
    "實驗性轉換：PDF 並非試算表／簡報／原始 Office 文件，版面及內容結構可能不完整。"
    "正式用途建議輸出 DOCX（可自動相容模式）。"
)


def pdf2docx_available() -> bool:
    try:
        import pdf2docx  # noqa: F401
        return True
    except ImportError:
        return False


def pdf2docx_status() -> dict[str, str | bool]:
    """Status entry for tools / capability UI."""
    try:
        import pdf2docx

        version = getattr(pdf2docx, "__version__", "") or ""
        return {
            "available": True,
            "label": "PDF→DOCX 相容引擎",
            "path": "",
            "version": str(version) if version else "pdf2docx",
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


def is_windows_stack_buffer_overrun(returncode: int | None) -> bool:
    if returncode is None:
        return False
    if returncode in (
        WIN_STATUS_STACK_BUFFER_OVERRUN_SIGNED,
        WIN_STATUS_STACK_BUFFER_OVERRUN_UNSIGNED,
        WIN_STATUS_STACK_BUFFER_OVERRUN,
    ):
        return True
    # Normalize signed 32-bit codes to unsigned.
    unsigned = returncode & 0xFFFFFFFF
    return unsigned == WIN_STATUS_STACK_BUFFER_OVERRUN


def normalize_returncode_display(returncode: int | None) -> str:
    if returncode is None:
        return "unknown"
    unsigned = returncode & 0xFFFFFFFF
    if unsigned == WIN_STATUS_STACK_BUFFER_OVERRUN or is_windows_stack_buffer_overrun(returncode):
        return f"0xC0000409 ({returncode})"
    if returncode < 0 or unsigned > 0x7FFFFFFF:
        return f"0x{unsigned:08X} ({returncode})"
    return str(returncode)


def looks_like_libreoffice_store_failure(text: str) -> bool:
    lowered = (text or "").lower()
    return (
        "impl_store" in lowered
        or "sfxbasemodel::impl_store" in lowered
        or ("error area:io" in lowered and "class:write" in lowered)
        or "class:write code:16" in lowered
        or "io class:write" in lowered
    )


def looks_like_unsupported_export_filter(text: str) -> bool:
    lowered = (text or "").lower()
    return (
        "unknown export filter" in lowered
        or "no export filter" in lowered
        or "could not find filter" in lowered
        or "unsupported filter" in lowered
        or "filter not found" in lowered
    )


def format_process_error(
    *,
    returncode: int | None = None,
    stdout: str = "",
    stderr: str = "",
    timeout: bool = False,
    timeout_seconds: int | None = None,
    executable: str = "",
    tool_label: str = "LibreOffice",
    not_found: bool = False,
    permission_denied: bool = False,
    output_missing: bool = False,
    expected_output: str = "",
) -> str:
    """
    Build a user-facing Traditional Chinese process error with optional technical details.
    Never return only a raw exit code.
    """
    combined = f"{stdout or ''}\n{stderr or ''}".strip()
    summary = ""
    suggestion = ""

    if timeout:
        secs = timeout_seconds if timeout_seconds is not None else "?"
        summary = f"{tool_label} 轉換逾時（{secs} 秒）。檔案可能過大或文件引擎卡住。"
        suggestion = "請縮短頁數後重試，或改用較簡單的 PDF／其他輸出格式。"
    elif not_found:
        path_hint = f"（{executable}）" if executable else ""
        summary = f"找不到 {tool_label} 執行檔{path_hint}。"
        suggestion = "請到「狀態」頁安裝或指定正確的工具路徑後重試。"
    elif permission_denied:
        path_hint = f"（{executable}）" if executable else ""
        summary = f"沒有權限執行 {tool_label}{path_hint}。"
        suggestion = "請以具足夠權限的帳戶執行，或檢查防毒／檔案權限設定。"
    elif output_missing:
        expected = expected_output or "輸出檔"
        summary = f"{tool_label} 執行結束，但未產生輸出檔（預期：{expected}）。"
        suggestion = "原始檔案未被修改。請確認 PDF 未損壞，或改試其他格式／相容模式。"
    elif is_windows_stack_buffer_overrun(returncode):
        summary = (
            "LibreOffice 轉換程序意外崩潰（Windows 0xC0000409）。"
            "這通常表示 LibreOffice 無法把此 PDF 匯出成所選 Office 格式。"
            "原始 PDF 並未被修改。"
        )
        suggestion = "若目標為 DOCX，系統會自動嘗試相容模式；其他格式請改試 DOCX 或更新 LibreOffice。"
    elif looks_like_libreoffice_store_failure(combined):
        summary = (
            "LibreOffice 無法寫入 Office 輸出檔（SfxBaseModel::impl_store / Io Class:Write）。"
            "原始 PDF 並未被修改。"
        )
        suggestion = "請確認輸出資料夾可寫入；DOCX 將自動嘗試相容模式。"
    elif looks_like_unsupported_export_filter(combined):
        summary = f"{tool_label} 不支援此匯出篩選器或格式。"
        suggestion = "請改選其他 Office 格式，或更新 LibreOffice。"
    elif returncode not in (None, 0):
        summary = f"{tool_label} 轉換失敗（退出碼 {normalize_returncode_display(returncode)}）。原始檔案並未被修改。"
        suggestion = "請檢查輸入檔是否完整，或改試其他輸出格式。"
    else:
        summary = f"{tool_label} 轉換失敗。原始檔案並未被修改。"
        suggestion = "請檢查輸入檔後重試。"

    parts = [summary]
    if suggestion:
        parts.append(f"建議：{suggestion}")
    if combined:
        # Cap technical dump so job cards stay usable.
        detail = combined if len(combined) <= 4000 else combined[:4000] + "\n…（已截斷）"
        parts.append(f"【技術詳情】\n{detail}")
    elif returncode not in (None, 0) and not timeout:
        parts.append(f"【技術詳情】\nexit code={normalize_returncode_display(returncode)}")
        if executable:
            parts.append(f"executable={executable}")
    return "\n".join(parts)


def should_try_docx_fallback(error: BaseException | str) -> bool:
    """DOCX-only: any LibreOffice failure may fall back to pdf2docx."""
    text = str(error or "")
    if not text:
        return True
    # Explicit signals (crash / store / missing output / non-zero) — all LO failures qualify.
    return True


def remove_incomplete_office_output(path: Path, *, min_bytes: int = 64, force: bool = False) -> bool:
    """Delete zero-byte / incomplete Office outputs (or any file if force=True). Returns True if removed."""
    try:
        if not path.is_file():
            return False
        size = path.stat().st_size
        if force or size < min_bytes:
            path.unlink(missing_ok=True)
            return True
    except OSError:
        return False
    return False


def cleanup_lo_profile(profile_dir: Path) -> None:
    try:
        if profile_dir.exists():
            shutil.rmtree(profile_dir, ignore_errors=True)
    except OSError:
        pass


def sanitize_docx_engine(value: str | None) -> str:
    """auto = LibreOffice then pdf2docx; compat = skip LibreOffice (DOCX only)."""
    text = (value or "auto").strip().lower()
    if text in {"auto", "compat", "compatible", "pdf2docx"}:
        return "compat" if text in {"compat", "compatible", "pdf2docx"} else "auto"
    raise ValueError("docxEngine must be 'auto' or 'compat'")


def sanitize_scan_ocr(value: str | None) -> str:
    """auto = OCR when low text; force = always OCR→DOCX; off = never."""
    text = (value or "auto").strip().lower()
    if text in {"", "auto"}:
        return "auto"
    if text in {"force", "on", "1", "true", "yes"}:
        return "force"
    if text in {"off", "0", "false", "no", "never"}:
        return "off"
    raise ValueError("scanOcr must be 'auto', 'force', or 'off'")


def pdf_extractable_text_chars(input_path: Path, max_pages: int = 3) -> int:
    """Rough count of extractable text; low values often mean scanned/image-only PDFs."""
    try:
        from pypdf import PdfReader  # lazy import
    except ImportError:
        return -1
    try:
        reader = PdfReader(str(input_path))
        total = 0
        for index, page in enumerate(reader.pages):
            if index >= max_pages:
                break
            try:
                total += len((page.extract_text() or "").strip())
            except Exception:
                continue
        return total
    except Exception:
        return -1


def maybe_scan_ocr_hint(input_path: Path) -> str | None:
    chars = pdf_extractable_text_chars(input_path)
    if chars >= 0 and chars < 40:
        return DOCX_SCAN_OCR_HINT
    return None


def write_text_docx_sync(output_path: Path, text: str, *, title: str = "SwiftLocal OCR Export") -> None:
    """Write a minimal OOXML .docx from plain text (no python-docx dependency)."""
    body = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    paragraphs = body.split("\n") if body else [""]
    runs: list[str] = []
    for line in paragraphs:
        # Empty lines become empty paragraphs for spacing.
        runs.append(
            f'<w:p><w:r><w:t xml:space="preserve">{xml_escape(line)}</w:t></w:r></w:p>'
        )
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:body>{"".join(runs)}<w:sectPr/></w:body></w:document>'
    )
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""
    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""
    doc_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>"""
    safe_title = xml_escape(title or "SwiftLocal")
    core = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>{safe_title}</dc:title>
  <dc:creator>SwiftLocal</dc:creator>
  <cp:lastModifiedBy>SwiftLocal</cp:lastModifiedBy>
</cp:coreProperties>"""
    app = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>SwiftLocal</Application>
</Properties>"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("word/document.xml", document_xml)
        zf.writestr("word/_rels/document.xml.rels", doc_rels)
        zf.writestr("docProps/core.xml", core)
        zf.writestr("docProps/app.xml", app)


async def tesseract_available() -> bool:
    try:
        tools = await tools_service.detect_tools()
        tool = tools.get("tesseract")
        return bool(tool and tool.get("available"))
    except Exception:
        return False


def _merge_pdf_files_sync(page_pdfs: list[Path], output_path: Path) -> None:
    try:
        from pypdf import PdfWriter  # lazy import
    except ImportError as error:
        raise RuntimeError("合併可搜尋 PDF 需要 pypdf") from error
    writer = PdfWriter()
    for page_pdf in page_pdfs:
        writer.append(str(page_pdf))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as handle:
        writer.write(handle)


async def create_searchable_pdf_via_ocr(
    input_path: Path,
    output_dir: Path,
    *,
    language: str = "eng",
    max_pages: int = OCR_PDF_MAX_PAGES_DEFAULT,
) -> tuple[Path, list[str]]:
    """
    Rasterize PDF pages, run Tesseract PDF output per page, merge into one searchable PDF.
    Output: {stem}_ocr_searchable.pdf in output_dir.
    """
    ensure_not_cancelled()
    require_unencrypted_pdf(input_path)
    tool = await tools_service.require_tool("tesseract")
    clean_language = (language or "eng").strip() or "eng"
    page_limit = max(1, min(int(max_pages or OCR_PDF_MAX_PAGES_DEFAULT), OCR_PDF_MAX_PAGES_HARD_LIMIT))
    tessdata_dir = resolve_tessdata_dir(Path(str(tool["path"])))
    work = output_dir / f"{input_path.stem}_ocr_searchable_work"
    if work.exists():
        shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True, exist_ok=True)
    logs: list[str] = []
    try:
        page_images, render_log = await asyncio.to_thread(
            _render_pdf_pages_sync, input_path, work, page_limit, OCR_PDF_RENDER_SCALE
        )
        logs.append(render_log)
        if not page_images:
            raise RuntimeError(f"PDF 沒有可 OCR 的頁面：{input_path.name}")

        page_pdfs: list[Path] = []
        for index, image_path in enumerate(page_images, start=1):
            ensure_not_cancelled()
            page_base = work / f"page_{index:03d}_searchable"
            args = [str(image_path), str(page_base), "-l", clean_language, "pdf"]
            if tessdata_dir:
                args.extend(["--tessdata-dir", str(tessdata_dir)])
            log = await run_process(str(tool["path"]), args, timeout=300, tool_label="Tesseract")
            if log:
                logs.append(log)
            page_pdf = page_base.with_suffix(".pdf")
            if not page_pdf.is_file() or page_pdf.stat().st_size < 64:
                raise RuntimeError(f"Tesseract 未產生第 {index} 頁可搜尋 PDF")
            page_pdfs.append(page_pdf)

        final_path = output_dir / f"{input_path.stem}_ocr_searchable.pdf"
        if final_path.exists():
            remove_incomplete_office_output(final_path, force=True)
        await asyncio.to_thread(_merge_pdf_files_sync, page_pdfs, final_path)
        if not final_path.is_file() or final_path.stat().st_size < 64:
            raise RuntimeError("合併可搜尋 PDF 失敗")
        logs.append(
            f"ocr-searchable-pdf: {input_path.name} -> {final_path.name} ({len(page_pdfs)} page(s))"
        )
        return final_path, logs
    finally:
        shutil.rmtree(work, ignore_errors=True)


async def convert_pdf_to_docx_via_searchable_ocr(
    input_path: Path,
    output_dir: Path,
    *,
    language: str = "eng",
    max_pages: int = OCR_PDF_MAX_PAGES_DEFAULT,
    prior_error: BaseException | None = None,
) -> tuple[Path, list[str]]:
    """OCR → searchable PDF intermediate → pdf2docx (preferred scan path)."""
    logs: list[str] = []
    if prior_error is not None:
        logs.append(str(prior_error))
    searchable, ocr_logs = await create_searchable_pdf_via_ocr(
        input_path, output_dir, language=language, max_pages=max_pages
    )
    logs.extend(ocr_logs)
    if not pdf2docx_available():
        raise RuntimeError(
            "已建立可搜尋 PDF，但 pdf2docx 未安裝，無法繼續匯出 DOCX。"
            "請安裝 backend/requirements.txt；可搜尋 PDF 已保留於輸出目錄。"
        )
    final_path = output_dir / f"{input_path.stem}.docx"
    temp_path = output_dir / f"{input_path.stem}.searchable.pdf2docx.tmp.docx"
    try:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
        await asyncio.to_thread(_pdf_to_docx_sync, searchable, temp_path)
        if not temp_path.is_file() or temp_path.stat().st_size < 64:
            remove_incomplete_office_output(temp_path)
            raise RuntimeError("可搜尋 PDF → DOCX 未產生有效輸出")
        if final_path.exists():
            remove_incomplete_office_output(final_path, force=True)
        temp_path.replace(final_path)
    except Exception:
        remove_incomplete_office_output(temp_path)
        raise
    logs.append(DOCX_SEARCHABLE_OCR_LOG)
    logs.append(f"converted (ocr-searchable): {input_path.name} -> {final_path.name}")
    logs.append(f"intermediate: {searchable.name}")
    return final_path, logs


async def convert_pdf_to_docx_via_ocr(
    input_path: Path,
    output_dir: Path,
    *,
    language: str = "eng",
    max_pages: int = OCR_PDF_MAX_PAGES_DEFAULT,
    prior_error: BaseException | None = None,
) -> tuple[Path, list[str]]:
    """Rasterize + Tesseract OCR, then write a plain-text DOCX (fallback of searchable path)."""
    ensure_not_cancelled()
    require_unencrypted_pdf(input_path)
    ocr_work = output_dir / f"{input_path.stem}_ocr_docx_work"
    if ocr_work.exists():
        shutil.rmtree(ocr_work, ignore_errors=True)
    ocr_work.mkdir(parents=True, exist_ok=True)
    logs: list[str] = []
    if prior_error is not None:
        logs.append(str(prior_error))
    try:
        txt_paths, ocr_logs = await ocr_pdf([input_path], ocr_work, language, max_pages)
        logs.extend(ocr_logs)
        if not txt_paths or not txt_paths[0].is_file():
            raise RuntimeError("OCR 未產生文字檔")
        text = txt_paths[0].read_text(encoding="utf-8", errors="replace")
        if not text.strip():
            raise RuntimeError("OCR 結果為空（請確認語言代碼或影像品質）")
        final_path = output_dir / f"{input_path.stem}.docx"
        if final_path.exists():
            remove_incomplete_office_output(final_path, force=True)
        await asyncio.to_thread(
            write_text_docx_sync, final_path, text, title=f"{input_path.stem} (OCR)"
        )
        if not final_path.is_file() or final_path.stat().st_size < 64:
            raise RuntimeError("OCR→DOCX 未產生有效輸出檔")
        logs.append(DOCX_OCR_PIPELINE_LOG)
        logs.append(f"converted (ocr): {input_path.name} -> {final_path.name}")
        return final_path, logs
    finally:
        shutil.rmtree(ocr_work, ignore_errors=True)


async def _convert_pdf_to_docx_compat(
    input_path: Path,
    output_dir: Path,
    *,
    reason_log: str,
    prior_error: BaseException | None = None,
    scan_ocr: str = "auto",
    language: str = "eng",
    max_pages: int = OCR_PDF_MAX_PAGES_DEFAULT,
) -> tuple[Path, list[str]]:
    """pdf2docx and/or OCR paths depending on scanOcr and extractable text."""
    ensure_not_cancelled()
    mode = sanitize_scan_ocr(scan_ocr)
    low_text = maybe_scan_ocr_hint(input_path) is not None
    want_ocr = mode == "force" or (mode == "auto" and low_text)
    can_ocr = await tesseract_available()

    if want_ocr and can_ocr:
        # Preferred: searchable PDF intermediate → DOCX; fallback: plain-text OCR DOCX.
        try:
            return await convert_pdf_to_docx_via_searchable_ocr(
                input_path,
                output_dir,
                language=language,
                max_pages=max_pages,
                prior_error=prior_error,
            )
        except Exception as searchable_error:
            try:
                return await convert_pdf_to_docx_via_ocr(
                    input_path,
                    output_dir,
                    language=language,
                    max_pages=max_pages,
                    prior_error=searchable_error,
                )
            except Exception as ocr_error:
                if mode == "force":
                    detail = f"\n【技術詳情】\nsearchable: {searchable_error}\ntext: {ocr_error}"
                    if prior_error:
                        detail += f"\n先前：{prior_error}"
                    raise RuntimeError(
                        "OCR 管線失敗（可搜尋 PDF 與純文字 DOCX 皆未成功）。"
                        "請確認 Tesseract、語言資料與影像品質。"
                        + detail
                    ) from ocr_error
                prior_error = ocr_error if prior_error is None else prior_error

    if not pdf2docx_available():
        if want_ocr and not can_ocr:
            raise RuntimeError(
                "此 PDF 文字很少，需要 OCR→DOCX，但 Tesseract 不可用。"
                "請到「狀態」頁安裝／指定 Tesseract，或關閉掃描 OCR 並安裝 pdf2docx。"
            ) from prior_error
        detail = f"\n【技術詳情】\n{prior_error}" if prior_error else ""
        raise RuntimeError(DOCX_FALLBACK_MISSING_ENGINE + detail) from prior_error

    ensure_not_cancelled()
    expected_name = f"{input_path.stem}.docx"
    final_path = output_dir / expected_name
    temp_path = output_dir / f"{input_path.stem}.pdf2docx.tmp.docx"
    logs: list[str] = []
    if prior_error is not None:
        logs.append(str(prior_error))
    logs.append(reason_log)
    try:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
        await asyncio.to_thread(_pdf_to_docx_sync, input_path, temp_path)
        if not temp_path.is_file() or temp_path.stat().st_size < 64:
            remove_incomplete_office_output(temp_path)
            raise RuntimeError("相容模式未產生有效的 DOCX 輸出檔")
        if final_path.exists():
            remove_incomplete_office_output(final_path, force=True)
        temp_path.replace(final_path)
    except Exception as fallback_error:
        remove_incomplete_office_output(temp_path)
        remove_incomplete_office_output(final_path)
        # Last resort: OCR if allowed and not yet forced-only failure path
        if mode != "off" and can_ocr:
            try:
                return await convert_pdf_to_docx_via_ocr(
                    input_path,
                    output_dir,
                    language=language,
                    max_pages=max_pages,
                    prior_error=fallback_error,
                )
            except Exception:
                pass
        if isinstance(fallback_error, RuntimeError) and "相容引擎未安裝" in str(fallback_error):
            raise
        if prior_error is not None:
            raise RuntimeError(
                "LibreOffice 與相容模式皆無法完成 PDF→DOCX 轉換。"
                f"\n建議：確認 PDF 未加密／未損毀；掃描件請開啟 OCR→DOCX。並安裝 backend/requirements.txt。\n"
                f"【技術詳情】\nLibreOffice：{prior_error}\n相容模式：{fallback_error}"
            ) from fallback_error
        raise RuntimeError(
            f"相容模式無法完成 PDF→DOCX 轉換。\n建議：確認 PDF 未加密；掃描件請用 OCR→DOCX。\n【技術詳情】\n{fallback_error}"
        ) from fallback_error

    hint = maybe_scan_ocr_hint(input_path)
    if hint:
        logs.append(hint)
    logs.append(f"converted (compat): {input_path.name} -> {final_path.name}")
    return final_path, logs


async def convert_pdf_to_office(
    input_paths: list[Path],
    output_dir: Path,
    extension: str,
    docx_engine: str = "auto",
    scan_ocr: str = "auto",
    language: str = "eng",
    max_pages: int = OCR_PDF_MAX_PAGES_DEFAULT,
) -> tuple[list[Path], list[str]]:
    clean_extension = sanitize_extension(extension or "docx")
    if clean_extension not in ALLOWED_PDF_TO_OFFICE_EXTENSIONS:
        raise ValueError(f"Unsupported Office extension: {clean_extension}. Allowed: {sorted(ALLOWED_PDF_TO_OFFICE_EXTENSIONS)}")
    engine = sanitize_docx_engine(docx_engine)
    ocr_mode = sanitize_scan_ocr(scan_ocr)
    if engine == "compat" and clean_extension != "docx":
        raise ValueError("docxEngine=compat 僅適用於 DOCX 輸出")

    logs: list[str] = []
    outputs: list[Path] = []
    lo_timeout = 180
    page_limit = max(1, min(int(max_pages or OCR_PDF_MAX_PAGES_DEFAULT), OCR_PDF_MAX_PAGES_HARD_LIMIT))

    def append_docx_and_side_products(input_path: Path, docx_path: Path) -> None:
        outputs.append(docx_path)
        side = output_dir / f"{input_path.stem}_ocr_searchable.pdf"
        if side.is_file() and side.resolve() != docx_path.resolve():
            outputs.append(side)

    # Direct compat / OCR path (skip LibreOffice) — useful when LO crashes on certain PDFs.
    if clean_extension == "docx" and engine == "compat":
        for input_path in input_paths:
            ensure_not_cancelled()
            require_unencrypted_pdf(input_path)
            path, item_logs = await _convert_pdf_to_docx_compat(
                input_path,
                output_dir,
                reason_log=DOCX_COMPAT_DIRECT_LOG,
                scan_ocr=ocr_mode,
                language=language or "eng",
                max_pages=page_limit,
            )
            logs.extend(item_logs)
            append_docx_and_side_products(input_path, path)
        return outputs, logs

    tool = await tools_service.require_tool("libreOffice")
    filter_name = _OFFICE_FILTER_MAP[clean_extension]
    convert_to = f"{clean_extension}:{filter_name}"

    for input_path in input_paths:
        ensure_not_cancelled()
        require_unencrypted_pdf(input_path)
        # Unique profile per input so concurrent/parallel LO instances never share user config.
        profile_dir = output_dir / f"{input_path.stem}_lo_profile"
        if profile_dir.exists():
            cleanup_lo_profile(profile_dir)
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
        expected_name = f"{input_path.stem}.{clean_extension}"
        expected_path = output_dir / expected_name
        before = snapshot_output_dir(output_dir)
        lo_error: BaseException | None = None
        lo_log = ""

        try:
            try:
                lo_log = await run_process(
                    str(tool["path"]),
                    args,
                    timeout=lo_timeout,
                    tool_label="LibreOffice",
                )
            except JobCancelled:
                raise
            except Exception as error:
                lo_error = error

            output_path: Path | None = None
            if lo_error is None:
                try:
                    output_path = resolve_libreoffice_output(output_dir, input_path, clean_extension, before)
                    if not output_path.is_file() or output_path.stat().st_size < 64:
                        remove_incomplete_office_output(output_path)
                        lo_error = RuntimeError(
                            format_process_error(
                                output_missing=True,
                                expected_output=expected_name,
                                stdout=lo_log,
                                tool_label="LibreOffice",
                            )
                        )
                        output_path = None
                except Exception as resolve_error:
                    remove_incomplete_office_output(expected_path)
                    lo_error = resolve_error
                    # Enrich bare "not found" messages.
                    if "找不到輸出檔" in str(resolve_error) and "【技術詳情】" not in str(resolve_error):
                        lo_error = RuntimeError(
                            format_process_error(
                                output_missing=True,
                                expected_output=expected_name,
                                stdout=str(resolve_error),
                                stderr=lo_log,
                                tool_label="LibreOffice",
                            )
                        )

            if lo_error is None and output_path is not None:
                logs.append(lo_log or f"converted: {input_path.name} -> {output_path.name}")
                outputs.append(output_path)
                continue

            # LibreOffice failed — DOCX may fall back to pdf2docx; other formats fail clearly.
            assert lo_error is not None
            remove_incomplete_office_output(expected_path)
            # Drop incomplete/new LO artifacts (target ext or .tmp leftovers) created this attempt.
            try:
                for entry in output_dir.iterdir():
                    if not entry.is_file():
                        continue
                    name_lower = entry.name.lower()
                    ext = entry.suffix.lower().lstrip(".")
                    is_target = ext == clean_extension
                    is_lo_tmp = name_lower.endswith(".tmp") or ".tmp." in name_lower
                    if not (is_target or is_lo_tmp):
                        continue
                    prev = before.get(entry.name)
                    try:
                        st = entry.stat()
                    except OSError:
                        continue
                    if prev is None or prev != (st.st_mtime_ns, st.st_size):
                        if is_lo_tmp or st.st_size < 64:
                            remove_incomplete_office_output(entry, force=is_lo_tmp or st.st_size < 64)
            except OSError:
                pass

            if clean_extension == "docx" and should_try_docx_fallback(lo_error):
                path, item_logs = await _convert_pdf_to_docx_compat(
                    input_path,
                    output_dir,
                    reason_log=DOCX_FALLBACK_LOG,
                    prior_error=lo_error,
                    scan_ocr=ocr_mode,
                    language=language or "eng",
                    max_pages=page_limit,
                )
                logs.extend(item_logs)
                append_docx_and_side_products(input_path, path)
                continue

            # Non-DOCX or fallback not applicable: surface a clear error.
            message = str(lo_error)
            if "【技術詳情】" not in message and "Process exited" in message:
                message = format_process_error(
                    stdout=message,
                    tool_label="LibreOffice",
                )
            if clean_extension in {"xlsx", "pptx", "odt"}:
                experimental_note = f"\n說明：PDF→{clean_extension.upper()} — {EXPERIMENTAL_OFFICE_NOTE}"
                if "實驗性" not in message:
                    message = message + experimental_note
            raise RuntimeError(message) from lo_error
        finally:
            cleanup_lo_profile(profile_dir)

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


async def run_process(
    executable: str,
    args: list[str],
    timeout: int = 300,
    tool_label: str = "外部程序",
) -> str:
    ensure_not_cancelled()
    job_id = _current_job_id.get()
    return await asyncio.to_thread(
        _run_process_sync, executable, args, timeout, job_id, tool_label
    )


def _run_process_sync(
    executable: str,
    args: list[str],
    timeout: int,
    job_id: str | None,
    tool_label: str = "外部程序",
) -> str:
    if job_id and _cancel_requested.get(job_id):
        raise JobCancelled("任務已取消")
    try:
        proc = subprocess.Popen(
            [executable, *args],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError as error:
        raise RuntimeError(
            format_process_error(
                not_found=True,
                executable=executable,
                tool_label=tool_label,
            )
        ) from error
    except PermissionError as error:
        raise RuntimeError(
            format_process_error(
                permission_denied=True,
                executable=executable,
                tool_label=tool_label,
            )
        ) from error

    if job_id:
        _active_processes[job_id] = proc
    try:
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, stderr = proc.communicate()
            raise RuntimeError(
                format_process_error(
                    timeout=True,
                    timeout_seconds=timeout,
                    stdout=stdout or "",
                    stderr=stderr or "",
                    executable=executable,
                    tool_label=tool_label,
                )
            ) from None
    finally:
        if job_id:
            _active_processes.pop(job_id, None)

    output = f"{stdout or ''}{stderr or ''}".strip()
    if job_id and _cancel_requested.get(job_id):
        raise JobCancelled("任務已取消")
    if proc.returncode != 0:
        raise RuntimeError(
            format_process_error(
                returncode=proc.returncode,
                stdout=stdout or "",
                stderr=stderr or "",
                executable=executable,
                tool_label=tool_label,
            )
        )
    # LibreOffice sometimes exits 0 but still logs store failures.
    if looks_like_libreoffice_store_failure(output):
        raise RuntimeError(
            format_process_error(
                returncode=proc.returncode,
                stdout=stdout or "",
                stderr=stderr or "",
                executable=executable,
                tool_label=tool_label,
            )
        )
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
