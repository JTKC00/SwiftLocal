from __future__ import annotations

import asyncio
import json
import os
import shutil
import unicodedata
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import UploadFile

from .conversion_service import (
    ALLOWED_PDF_TO_OFFICE_EXTENSIONS,
    OCR_PDF_MAX_PAGES_DEFAULT,
    OCR_PDF_MAX_PAGES_HARD_LIMIT,
    JobCancelled,
    begin_job,
    compress_pdf,
    convert_image,
    convert_media,
    convert_office_to_pdf,
    convert_pdf_to_docx,
    convert_pdf_to_office,
    create_searchable_pdf_via_ocr,
    decrypt_pdf,
    encrypt_pdf,
    end_job,
    ensure_not_cancelled,
    merge_pdfs,
    ocr_images,
    ocr_pdf,
    request_cancel,
    rotate_pdf,
    sanitize_extension,
    split_pdf,
)
from .job_errors import (
    ERROR_CODES,
    classify_job_error,
    error_code_label,
)


ROOT_DIR = Path(__file__).resolve().parents[1]
TEMP_DIR = ROOT_DIR / "temp"
JOBS_DIR = TEMP_DIR / "jobs"
JOBS_STATE_PATH = TEMP_DIR / "jobs-state.json"
MAX_PERSISTED_JOBS = 80
# Persisted jobs-state.json root.version — see docs/jobs-state-schema.md
JOBS_STATE_SCHEMA_VERSION = 2
PASSWORD_JOB_TYPES = {"pdf-encrypt", "pdf-decrypt"}
TERMINAL_JOB_STATUSES = frozenset({"done", "failed", "cancelled"})


def positive_env_int(name: str, fallback: int) -> int:
    try:
        value = int(os.environ.get(name, fallback))
        return value if value > 0 else fallback
    except (TypeError, ValueError):
        return fallback


MAX_INPUT_FILE_BYTES = positive_env_int("SWIFTLOCAL_MAX_FILE_BYTES", 1024 ** 3)
MAX_JOB_INPUT_BYTES = positive_env_int("SWIFTLOCAL_MAX_JOB_BYTES", 2 * 1024 ** 3)
MAX_QUEUED_JOBS = positive_env_int("SWIFTLOCAL_MAX_QUEUED_JOBS", 50)
MIN_DISK_MULTIPLIER = positive_env_int("SWIFTLOCAL_DISK_MULTIPLIER", 2)
# Finished jobs older than this are auto-removed from history (and FastAPI work dirs).
JOB_RETENTION_HOURS = positive_env_int("SWIFTLOCAL_JOB_RETENTION_HOURS", 72)
SUPPORTED_JOB_TYPES = {
    "office-to-pdf", "pdf-to-office", "pdf-to-searchable-pdf", "media-convert",
    "ocr-image", "ocr-pdf", "pdf-to-docx", "pdf-merge", "pdf-split", "pdf-rotate",
    "image-convert", "pdf-encrypt", "pdf-decrypt", "pdf-compress",
}


def redact_job_options(options: dict[str, str] | None) -> dict[str, str]:
    return {
        str(key): str(value)
        for key, value in (options or {}).items()
        if "password" not in str(key).lower() and "passphrase" not in str(key).lower()
    }


def redact_job_text(value: object, options: dict[str, str] | None) -> str:
    safe = str(value or "")
    for key, secret in (options or {}).items():
        if ("password" in str(key).lower() or "passphrase" in str(key).lower()) and secret:
            safe = safe.replace(str(secret), "[REDACTED]")
    return safe


def normalize_job_progress(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    try:
        current = max(0, int(value.get("current") or 0))
        total = max(current, int(value.get("total") or 0))
    except (TypeError, ValueError):
        return None
    return {
        "current": current,
        "total": total,
        "phase": str(value.get("phase") or ""),
        "message": str(value.get("message") or ""),
    }


def normalize_image_item_results(value: object) -> list[dict]:
    if not isinstance(value, list):
        return []
    results: list[dict] = []
    for index, item in enumerate(value[:100]):
        if not isinstance(item, dict):
            continue
        try:
            result_index = max(0, int(item.get("index") if item.get("index") is not None else index))
        except (TypeError, ValueError):
            result_index = index
        results.append({
            "index": result_index,
            "name": Path(str(item.get("name") or f"image-{index + 1}")).name,
            "status": "done" if item.get("status") == "done" else "failed",
            "outputName": Path(str(item.get("outputName") or "")).name if item.get("outputName") else "",
            "error": str(item.get("error") or "")[:500],
        })
    return results


@dataclass
class Job:
    id: str
    type: str
    input_paths: list[Path]
    output_dir: Path
    options: dict[str, str]
    status: str = "queued"
    created_at: str = field(default_factory=lambda: now_iso())
    started_at: str | None = None
    finished_at: str | None = None
    output_paths: list[Path] = field(default_factory=list)
    log: list[str] = field(default_factory=list)
    error: str = ""
    error_code: str = ""
    error_hint: str = ""
    retriable: bool = True
    progress: dict | None = None
    item_results: list[dict] = field(default_factory=list)
    cancel_requested: bool = False


class JobService:
    def __init__(self):
        self.jobs: list[Job] = []
        self.running = False
        self.lock = asyncio.Lock()
        self._admission_lock = asyncio.Lock()
        self._inflight_job_ids: set[str] = set()
        self._jobs_state_trusted = True

    async def cleanup_all(self) -> None:
        """Legacy wipe — prefer restore_state() for persistence-aware startup."""
        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        for child in JOBS_DIR.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
        if JOBS_STATE_PATH.exists():
            JOBS_STATE_PATH.unlink(missing_ok=True)
        self.jobs = []

    def prune_jobs(self, *, now: datetime | None = None, force_finished: bool = False) -> dict[str, int]:
        """Drop old/excess terminal jobs and orphan work dirs. Never removes queued/running."""
        reference = now or datetime.now(timezone.utc)
        before = len(self.jobs)
        active = [job for job in self.jobs if job.status not in TERMINAL_JOB_STATUSES]
        terminal = [job for job in self.jobs if job.status in TERMINAL_JOB_STATUSES]

        retained_terminal: list[Job] = []
        removed_by_age = 0
        if force_finished:
            removed_by_age = len(terminal)
            terminal = []
        else:
            max_age = JOB_RETENTION_HOURS * 3600
            for job in terminal:
                finished = _parse_iso_timestamp(job.finished_at or job.created_at)
                age = (reference - finished).total_seconds() if finished else 0
                if finished and age > max_age:
                    removed_by_age += 1
                    self._remove_job_workdir(job.id)
                else:
                    retained_terminal.append(job)
            terminal = retained_terminal

        # Prefer keeping newest finished jobs when over the hard cap.
        terminal.sort(key=lambda job: job.finished_at or job.created_at or "", reverse=True)
        max_terminal = max(0, MAX_PERSISTED_JOBS - len(active))
        removed_by_cap = 0
        if len(terminal) > max_terminal:
            for job in terminal[max_terminal:]:
                self._remove_job_workdir(job.id)
                removed_by_cap += 1
            terminal = terminal[:max_terminal]

        # Restore original-ish order: active first (newest first as stored), then terminal by recency.
        self.jobs = active + terminal
        orphan_dirs = self._prune_orphan_job_dirs()
        self._save_jobs_state()
        return {
            "before": before,
            "after": len(self.jobs),
            "removedByAge": removed_by_age,
            "removedByCap": removed_by_cap,
            "orphanDirs": orphan_dirs,
            "retentionHours": JOB_RETENTION_HOURS,
            "maxPersisted": MAX_PERSISTED_JOBS,
        }

    def _remove_job_workdir(self, job_id: str) -> None:
        shutil.rmtree(JOBS_DIR / job_id, ignore_errors=True)

    def _prune_orphan_job_dirs(self) -> int:
        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        if not self._jobs_state_trusted:
            return 0
        known = {job.id for job in self.jobs} | self._inflight_job_ids
        removed = 0
        for child in list(JOBS_DIR.iterdir()):
            if child.is_dir() and child.name not in known:
                shutil.rmtree(child, ignore_errors=True)
                removed += 1
        return removed

    async def restore_state(self) -> None:
        """Load persisted jobs, repair interrupted ones, prune orphan job dirs, resume queue."""
        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        TEMP_DIR.mkdir(parents=True, exist_ok=True)
        loaded_jobs = self._load_jobs_state()
        if loaded_jobs is None:
            # A missing state file is a valid empty state, but an unreadable or
            # malformed one cannot safely identify any work directory as orphaned.
            self.jobs = []
            return
        self.jobs = loaded_jobs
        self.prune_jobs()
        if any(job.status == "queued" for job in self.jobs):
            asyncio.create_task(self._run_next())

    def _load_jobs_state(self) -> list[Job] | None:
        try:
            raw = json.loads(JOBS_STATE_PATH.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return []
        except (OSError, UnicodeError, json.JSONDecodeError):
            self._jobs_state_trusted = False
            return None
        items = raw if isinstance(raw, list) else raw.get("jobs") if isinstance(raw, dict) else None
        if not isinstance(items, list):
            self._jobs_state_trusted = False
            return None
        jobs: list[Job] = []
        for item in items[:MAX_PERSISTED_JOBS]:
            if (
                not isinstance(item, dict)
                or not str(item.get("id") or "").strip()
                or not str(item.get("type") or "").strip()
            ):
                self._jobs_state_trusted = False
                return None
            try:
                job = self._job_from_dict(item)
            except (OSError, TypeError, ValueError):
                self._jobs_state_trusted = False
                return None
            if job:
                jobs.append(job)
        return jobs

    def _job_from_dict(self, item: object) -> Job | None:
        if not isinstance(item, dict):
            return None
        job_id = str(item.get("id") or "").strip()
        job_type = str(item.get("type") or "").strip()
        if not job_id or not job_type:
            return None
        status = str(item.get("status") or "queued")
        error = str(item.get("error") or "")
        log = [str(line) for line in (item.get("log") or [])][-20:]
        finished_at = item.get("finishedAt") or item.get("finished_at")
        started_at = item.get("startedAt") or item.get("started_at")
        created_at = str(item.get("createdAt") or item.get("created_at") or now_iso())

        error_code = str(item.get("errorCode") or item.get("error_code") or "")
        error_hint = str(item.get("errorHint") or item.get("error_hint") or "")
        retriable = item.get("retriable") is not False

        if status == "running":
            status = "failed"
            error = error or "後端重啟時任務中斷"
            log.append(error)
            finished_at = finished_at or now_iso()
            classified = classify_job_error(error, job_type)
            error_code = str(classified["code"])
            error_hint = str(classified["hint"])
            retriable = bool(classified["retriable"])

        raw_options = item.get("options") if isinstance(item.get("options"), dict) else {}
        options = {str(k): str(v) for k, v in raw_options.items()}
        if status == "queued" and job_type in PASSWORD_JOB_TYPES:
            status = "failed"
            error = "任務因應用程式重啟而停止，請重新輸入密碼。"
            log.append(error)
            finished_at = finished_at or now_iso()
            classified = classify_job_error(error, job_type)
            error_code = str(classified["code"])
            error_hint = str(classified["hint"])
            retriable = False

        input_raw = item.get("inputPaths") or item.get("input_paths") or []
        input_paths = [Path(str(p)) for p in input_raw if str(p)]
        input_paths = [p for p in input_paths if p.exists()]
        if status == "queued" and not input_paths:
            return None

        output_raw = item.get("outputPaths") or item.get("output_paths") or []
        output_paths: list[Path] = []
        for entry in output_raw:
            if isinstance(entry, dict) and entry.get("name"):
                # Prefer stored absolute path, else job output dir + name
                candidate = Path(str(entry.get("path") or "")) if entry.get("path") else None
                if candidate and candidate.exists():
                    output_paths.append(candidate)
                else:
                    job_out = JOBS_DIR / job_id / "output" / str(entry["name"])
                    if job_out.exists():
                        output_paths.append(job_out)
            else:
                path = Path(str(entry))
                if path.exists():
                    output_paths.append(path)

        output_dir_raw = item.get("outputDir") or item.get("output_dir") or str(JOBS_DIR / job_id / "output")
        output_dir = Path(str(output_dir_raw))

        return Job(
            id=job_id,
            type=job_type,
            input_paths=input_paths,
            output_dir=output_dir,
            options=redact_job_options(options),
            status=status,
            created_at=created_at,
            started_at=str(started_at) if started_at else None,
            finished_at=str(finished_at) if finished_at else None,
            output_paths=output_paths,
            log=log,
            error=error,
            error_code=error_code,
            error_hint=error_hint,
            retriable=retriable,
            progress=normalize_job_progress(item.get("progress")),
            item_results=normalize_image_item_results(item.get("itemResults")),
            cancel_requested=False,
        )

    def _serialize_job(self, job: Job) -> dict:
        return {
            "id": job.id,
            "type": job.type,
            "inputPaths": [str(path) for path in job.input_paths],
            "outputDir": str(job.output_dir),
            "options": redact_job_options(job.options),
            "status": job.status,
            "createdAt": job.created_at,
            "startedAt": job.started_at,
            "finishedAt": job.finished_at,
            "outputPaths": [str(path) for path in job.output_paths],
            "log": [redact_job_text(line, job.options) for line in job.log[-12:]],
            "error": redact_job_text(job.error, job.options),
            "errorCode": job.error_code or "",
            "errorHint": job.error_hint or "",
            "retriable": job.retriable is not False,
            "progress": normalize_job_progress(job.progress),
            "itemResults": normalize_image_item_results(job.item_results),
        }

    def _save_jobs_state(self) -> None:
        if not self._jobs_state_trusted:
            return
        temp_path: Path | None = None
        try:
            TEMP_DIR.mkdir(parents=True, exist_ok=True)
            payload = {
                "version": JOBS_STATE_SCHEMA_VERSION,
                "savedAt": now_iso(),
                "jobs": [self._serialize_job(job) for job in self.jobs[:MAX_PERSISTED_JOBS]],
            }
            serialized = json.dumps(payload, ensure_ascii=False, indent=2)
            temp_path = JOBS_STATE_PATH.with_name(
                f".{JOBS_STATE_PATH.name}.{uuid.uuid4().hex}.tmp"
            )
            with temp_path.open("w", encoding="utf-8") as handle:
                handle.write(serialized)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_path, JOBS_STATE_PATH)
        except OSError:
            pass
        finally:
            if temp_path is not None:
                try:
                    temp_path.unlink(missing_ok=True)
                except OSError:
                    pass

    async def create_job(self, job_type: str, files: list[UploadFile], options: dict[str, str]) -> dict:
        if job_type not in SUPPORTED_JOB_TYPES:
            raise ValueError(f"Unsupported job type: {job_type}")
        if not files:
            raise ValueError("At least one file is required")

        clean_options = self._validate_options(job_type, options, len(files))
        async with self._admission_lock:
            pending_count = sum(job.status == "queued" for job in self.jobs)
            if pending_count + len(self._inflight_job_ids) >= MAX_QUEUED_JOBS:
                raise ValueError(f"Too many queued jobs (limit: {MAX_QUEUED_JOBS})")
            job_id = uuid.uuid4().hex
            self._inflight_job_ids.add(job_id)

        job_dir = JOBS_DIR / job_id
        input_dir = job_dir / "input"
        output_dir = job_dir / "output"
        try:
            input_dir.mkdir(parents=True, exist_ok=True)
            output_dir.mkdir(parents=True, exist_ok=True)

            input_paths = []
            used_names: set[str] = set()
            total_bytes = 0
            for upload in files:
                declared_size = int(getattr(upload, "size", 0) or 0)
                if declared_size > MAX_INPUT_FILE_BYTES:
                    raise ValueError(
                        f"{upload.filename or 'file'} exceeds the {format_bytes(MAX_INPUT_FILE_BYTES)} file limit"
                    )
                if total_bytes + declared_size > MAX_JOB_INPUT_BYTES:
                    raise ValueError(f"Job inputs exceed the {format_bytes(MAX_JOB_INPUT_BYTES)} total limit")
                filename = unique_name(sanitize_filename(upload.filename or "file"), used_names)
                input_path = input_dir / filename
                file_bytes = 0
                with input_path.open("wb") as target:
                    while chunk := await upload.read(1024 * 1024):
                        file_bytes += len(chunk)
                        total_bytes += len(chunk)
                        if file_bytes > MAX_INPUT_FILE_BYTES:
                            raise ValueError(f"{filename} exceeds the {format_bytes(MAX_INPUT_FILE_BYTES)} file limit")
                        if total_bytes > MAX_JOB_INPUT_BYTES:
                            raise ValueError(f"Job inputs exceed the {format_bytes(MAX_JOB_INPUT_BYTES)} total limit")
                        target.write(chunk)
                input_paths.append(input_path)

            required_bytes = total_bytes * MIN_DISK_MULTIPLIER
            available_bytes = shutil.disk_usage(output_dir).free
            if available_bytes < required_bytes:
                raise ValueError(
                    f"Not enough free disk space: {format_bytes(required_bytes)} required, "
                    f"{format_bytes(available_bytes)} available"
                )

            job = Job(
                id=job_id,
                type=job_type,
                input_paths=input_paths,
                output_dir=output_dir,
                options=clean_options,
            )
            async with self._admission_lock:
                self.jobs.insert(0, job)
                self._inflight_job_ids.discard(job_id)
        except BaseException:
            self._inflight_job_ids.discard(job_id)
            shutil.rmtree(job_dir, ignore_errors=True)
            raise
        self._save_jobs_state()
        asyncio.create_task(self._run_next())
        return self.public_job(job)

    def list_jobs(self) -> list[dict]:
        return [self.public_job(job) for job in self.jobs]

    def get_job(self, job_id: str) -> dict | None:
        job = self._find_job(job_id)
        return self.public_job(job) if job else None

    def output_path(self, job_id: str, filename: str) -> Path | None:
        job = self._find_job(job_id)
        if not job:
            return None
        requested = sanitize_filename(filename)
        for output_path in job.output_paths:
            if output_path.name == requested and output_path.exists():
                return output_path
        return None

    async def delete_job(self, job_id: str) -> bool:
        job = self._find_job(job_id)
        if not job:
            return False
        if job.status == "running":
            raise ValueError("無法刪除執行中的任務，請先取消或等完成後再刪除")
        self.jobs = [item for item in self.jobs if item.id != job_id]
        shutil.rmtree(JOBS_DIR / job_id, ignore_errors=True)
        self._save_jobs_state()
        return True

    async def cancel_job(self, job_id: str) -> dict | None:
        job = self._find_job(job_id)
        if not job:
            return None
        if job.status == "queued":
            job.status = "cancelled"
            job.error = "任務已取消"
            job.error_code = ERROR_CODES["CANCELLED"]
            job.error_hint = "可重新執行此任務（輸入檔仍存在時）。"
            job.retriable = True
            job.log.append(job.error)
            job.finished_at = now_iso()
            job.options = redact_job_options(job.options)
            self._save_jobs_state()
            return self.public_job(job)
        if job.status == "running":
            job.cancel_requested = True
            killed = request_cancel(job.id)
            if killed:
                job.log.append(
                    "取消請求已送出：已中止外部工具程序；任務將盡快結束。"
                )
            else:
                job.log.append(
                    "取消請求已送出：外部工具會立即中止；"
                    "本機處理會在目前頁面／檔案步驟完成後停止。"
                )
            self._save_jobs_state()
            return self.public_job(job)
        raise ValueError("只能取消排隊中或執行中的任務")

    async def _run_next(self) -> None:
        async with self.lock:
            if self.running:
                return
            self.running = True

        try:
            while True:
                job = next((item for item in reversed(self.jobs) if item.status == "queued"), None)
                if not job:
                    return
                await self._run_job(job)
        finally:
            self.running = False
            # If a job was enqueued while we held running=True, the concurrent
            # _run_next task may have bailed out early — re-check the queue.
            if any(item.status == "queued" for item in self.jobs):
                asyncio.create_task(self._run_next())

    async def _run_job(self, job: Job) -> None:
        if job.cancel_requested or job.status == "cancelled":
            job.status = "cancelled"
            job.error = job.error or "任務已取消"
            job.finished_at = now_iso()
            self._save_jobs_state()
            return

        job.status = "running"
        job.started_at = now_iso()
        job.progress = None
        job.item_results = []
        self._save_jobs_state()
        begin_job(job.id)
        def image_progress(current: int, total: int, message: str) -> None:
            job.progress = {
                "current": max(0, int(current)),
                "total": max(int(current), int(total)),
                "phase": "image-ocr" if job.type == "ocr-image" else "image-convert",
                "message": str(message),
            }
            self._save_jobs_state()

        try:
            ensure_not_cancelled()
            if job.type == "office-to-pdf":
                outputs, logs = await convert_office_to_pdf(job.input_paths, job.output_dir)
            elif job.type == "media-convert":
                outputs, logs = await convert_media(
                    job.input_paths,
                    job.output_dir,
                    job.options["extension"],
                    job.options,
                )
            elif job.type == "ocr-image":
                outputs, logs = await ocr_images(
                    job.input_paths,
                    job.output_dir,
                    job.options["language"],
                    job.options.get("imageOps") or "",
                    job.item_results,
                    image_progress,
                )
            elif job.type == "ocr-pdf":
                outputs, logs = await ocr_pdf(
                    job.input_paths,
                    job.output_dir,
                    job.options["language"],
                    int(job.options.get("maxPages") or OCR_PDF_MAX_PAGES_DEFAULT),
                    job.options.get("pages") or "",
                )
            elif job.type == "pdf-to-docx":
                outputs, logs = await convert_pdf_to_docx(job.input_paths, job.output_dir)
            elif job.type == "pdf-merge":
                outputs, logs = await merge_pdfs(job.input_paths, job.output_dir)
            elif job.type == "pdf-split":
                outputs, logs = await split_pdf(job.input_paths, job.output_dir, job.options["pages"])
            elif job.type == "pdf-rotate":
                outputs, logs = await rotate_pdf(job.input_paths, job.output_dir, int(job.options["angle"]))
            elif job.type == "pdf-to-office":
                outputs, logs = await convert_pdf_to_office(
                    job.input_paths,
                    job.output_dir,
                    job.options["extension"],
                    job.options.get("docxEngine") or "auto",
                    job.options.get("scanOcr") or "auto",
                    job.options.get("language") or "eng",
                    int(job.options.get("maxPages") or OCR_PDF_MAX_PAGES_DEFAULT),
                    job.options.get("ocrOutput") or "both",
                )
            elif job.type == "pdf-to-searchable-pdf":
                outputs = []
                logs = []
                language = job.options.get("language") or "chi_tra+eng"
                max_pages = int(job.options.get("maxPages") or OCR_PDF_MAX_PAGES_DEFAULT)
                for input_path in job.input_paths:
                    ensure_not_cancelled()
                    path, item_logs = await create_searchable_pdf_via_ocr(
                        input_path,
                        job.output_dir,
                        language=language,
                        max_pages=max_pages,
                    )
                    outputs.append(path)
                    logs.extend(item_logs)
            elif job.type == "image-convert":
                outputs, logs = await convert_image(
                    job.input_paths,
                    job.output_dir,
                    job.options["extension"],
                    job.options,
                    job.item_results,
                    image_progress,
                )
            elif job.type == "pdf-encrypt":
                outputs, logs = await encrypt_pdf(job.input_paths, job.output_dir, job.options["password"])
            elif job.type == "pdf-decrypt":
                outputs, logs = await decrypt_pdf(job.input_paths, job.output_dir, job.options["password"])
            elif job.type == "pdf-compress":
                outputs, logs = await compress_pdf(job.input_paths, job.output_dir)
            else:
                raise RuntimeError(f"Unsupported job type: {job.type}")

            ensure_not_cancelled()
            job.output_paths = [path for path in outputs if path.exists()]
            job.log.extend(log for log in logs if log)
            if job.cancel_requested:
                raise JobCancelled("任務已取消")
            if not job.output_paths:
                raise RuntimeError("Conversion finished but no output file was created")
            job.status = "done"
            job.error_code = ""
            job.error_hint = ""
            job.retriable = True
        except JobCancelled as error:
            job.error = str(error) or "任務已取消"
            job.log.append(job.error)
            job.status = "cancelled"
            job.error_code = ERROR_CODES["CANCELLED"]
            job.error_hint = "可重新執行此任務（輸入檔仍存在時）。"
            job.retriable = True
        except Exception as error:
            if job.cancel_requested:
                job.error = "任務已取消"
                job.log.append(job.error)
                job.status = "cancelled"
                job.error_code = ERROR_CODES["CANCELLED"]
                job.error_hint = "可重新執行此任務（輸入檔仍存在時）。"
                job.retriable = True
            else:
                classified = classify_job_error(error, job.type)
                job.error = str(classified["message"])
                job.log.append(job.error)
                job.status = "failed"
                job.error_code = str(classified["code"])
                job.error_hint = str(classified["hint"])
                job.retriable = bool(classified["retriable"])
        finally:
            end_job(job.id)
            job.finished_at = now_iso()
            job.log = [redact_job_text(line, job.options) for line in job.log]
            job.error = redact_job_text(job.error, job.options)
            job.options = redact_job_options(job.options)
            self.prune_jobs()

    async def retry_job(self, job_id: str) -> dict | None:
        job = self._find_job(job_id)
        if not job:
            return None
        if job.status in {"queued", "running"}:
            raise ValueError("只能重新執行已結束的任務")
        if job.retriable is False:
            raise ValueError(job.error_hint or "此任務無法自動重試，請從工具面板重新提交")
        missing = [path for path in job.input_paths if not path.exists()]
        if missing:
            raise ValueError(f"找不到輸入檔：{missing[0].name}")
        if job.type in PASSWORD_JOB_TYPES and not (job.options.get("password") or job.options.get("passphrase")):
            raise ValueError("此任務需要密碼，請從工具面板重新提交")
        async with self._admission_lock:
            pending_count = sum(item.status == "queued" for item in self.jobs)
            if pending_count + len(self._inflight_job_ids) >= MAX_QUEUED_JOBS:
                raise ValueError(f"Too many queued jobs (limit: {MAX_QUEUED_JOBS})")
            job.status = "queued"
            job.started_at = None
            job.finished_at = None
            job.output_paths = []
            job.error = ""
            job.error_code = ""
            job.error_hint = ""
            job.retriable = True
            job.cancel_requested = False
            job.log = [*job.log[-8:], "使用者重新執行任務"]
        self._save_jobs_state()
        asyncio.create_task(self._run_next())
        return self.public_job(job)

    async def copy_job(self, job_id: str) -> dict | None:
        job = self._find_job(job_id)
        if not job:
            return None
        missing = [path for path in job.input_paths if not path.exists()]
        if missing:
            raise ValueError(f"找不到輸入檔：{missing[0].name}")
        async with self._admission_lock:
            pending_count = sum(item.status == "queued" for item in self.jobs)
            if pending_count + len(self._inflight_job_ids) >= MAX_QUEUED_JOBS:
                raise ValueError(f"Too many queued jobs (limit: {MAX_QUEUED_JOBS})")
            new_id = uuid.uuid4().hex
            self._inflight_job_ids.add(new_id)
        input_dir = JOBS_DIR / new_id / "input"
        output_dir = JOBS_DIR / new_id / "output"
        try:
            input_dir.mkdir(parents=True, exist_ok=True)
            output_dir.mkdir(parents=True, exist_ok=True)
            copied_inputs: list[Path] = []
            for source in job.input_paths:
                target = input_dir / source.name
                shutil.copy2(source, target)
                copied_inputs.append(target)
            clone = Job(
                id=new_id,
                type=job.type,
                input_paths=copied_inputs,
                output_dir=output_dir,
                options=dict(job.options),
            )
            async with self._admission_lock:
                self.jobs.insert(0, clone)
                self._inflight_job_ids.discard(new_id)
        except BaseException:
            self._inflight_job_ids.discard(new_id)
            shutil.rmtree(JOBS_DIR / new_id, ignore_errors=True)
            raise
        self._save_jobs_state()
        asyncio.create_task(self._run_next())
        return self.public_job(clone)

    async def diagnostic_report(self, job_id: str | None = None) -> dict:
        from .tools_service import tools_service

        job = self._find_job(job_id) if job_id else None
        tools = await tools_service.detect_tools()
        tools_summary = {
            key: {
                "available": bool(info.get("available")),
                "version": str(info.get("version") or ""),
                "source": str(info.get("source") or ""),
                "path": str(info.get("path") or ""),
                "tessdataPath": str(info.get("tessdataPath") or ""),
                "detectedLanguages": list(info.get("detectedLanguages") or []),
                "detectionMethod": str(info.get("detectionMethod") or ""),
                "TESSDATA_PREFIX": str(info.get("TESSDATA_PREFIX") or ""),
            }
            for key, info in (tools or {}).items()
        }
        return {
            "generatedAt": now_iso(),
            "appVersion": self._app_version(),
            "platform": os.name,
            "jobsStateSchemaVersion": JOBS_STATE_SCHEMA_VERSION,
            "tools": tools_summary,
            "job": self.public_job(job) if job else None,
        }

    def _app_version(self) -> str:
        try:
            from backend.version import APP_VERSION

            return APP_VERSION
        except Exception:
            return "0.0.0"

    def public_job(self, job: Job) -> dict:
        space = compute_job_space_usage(job.input_paths, job.output_paths)
        return {
            "id": job.id,
            "type": job.type,
            "inputPaths": [item["name"] for item in space["inputs"]],
            "inputFiles": space["inputs"],
            "outputPaths": [
                self._public_output(job, Path(item["path"]))
                for item in space["outputs"]
            ],
            "options": redact_job_options(job.options),
            "status": job.status,
            "createdAt": job.created_at,
            "startedAt": job.started_at,
            "finishedAt": job.finished_at,
            "space": {
                "inputBytes": space["inputBytes"],
                "outputBytes": space["outputBytes"],
                "inputCount": space["inputCount"],
                "outputCount": space["outputCount"],
                "inputMissing": space["inputMissing"],
                "savedBytes": space["savedBytes"],
                "savedPercent": space["savedPercent"],
            },
            "log": [redact_job_text(line, job.options) for line in job.log[-6:]],
            "error": redact_job_text(job.error, job.options),
            "errorCode": job.error_code or "",
            "errorCodeLabel": error_code_label(job.error_code) if job.error_code else "",
            "errorHint": job.error_hint or "",
            "retriable": job.retriable is not False,
            # True while running after user asked to cancel (UI can show「取消中」).
            "cancelRequested": bool(job.cancel_requested and job.status == "running"),
            "progress": normalize_job_progress(job.progress),
            "itemResults": normalize_image_item_results(job.item_results),
        }

    def _public_output(self, job: Job, output_path: Path) -> dict[str, str | int]:
        return {
            "name": output_path.name,
            "size": output_path.stat().st_size if output_path.exists() else 0,
            "url": f"/api/jobs/{job.id}/outputs/{output_path.name}",
        }

    def _find_job(self, job_id: str) -> Job | None:
        return next((job for job in self.jobs if job.id == job_id), None)

    def _validate_options(self, job_type: str, options: dict[str, str], input_count: int = 0) -> dict[str, str]:
        if job_type == "media-convert":
            from .conversion_service import (
                sanitize_gif_fps,
                sanitize_media_bitrate,
                sanitize_media_crop,
                sanitize_media_scale,
                sanitize_media_time,
            )

            return {
                "extension": sanitize_extension(options.get("extension") or "mp4"),
                "videoBitrate": sanitize_media_bitrate(options.get("videoBitrate") or "", "videoBitrate"),
                "audioBitrate": sanitize_media_bitrate(options.get("audioBitrate") or "", "audioBitrate"),
                "scale": sanitize_media_scale(options.get("scale") or ""),
                "crop": sanitize_media_crop(options.get("crop") or ""),
                "start": sanitize_media_time(options.get("start") or "", "start"),
                "duration": sanitize_media_time(options.get("duration") or "", "duration"),
                "gifFps": sanitize_gif_fps(options.get("gifFps") or ""),
            }
        if job_type == "image-convert":
            from .conversion_service import (
                sanitize_image_dimension,
                sanitize_image_keep_ratio,
                sanitize_image_ops,
                sanitize_image_quality,
                sanitize_image_watermark_position,
                sanitize_image_watermark_text,
            )

            extension = sanitize_extension(options.get("extension") or "jpg")
            if extension not in {"jpg", "jpeg", "png", "webp", "tiff", "tif", "bmp", "gif"}:
                raise ValueError(f"Unsupported image format: {extension}")
            image_ops = sanitize_image_ops(options.get("imageOps") or "", input_count)
            return {
                "extension": extension,
                "imageOps": json.dumps(image_ops, ensure_ascii=False, separators=(",", ":")),
                "quality": str(sanitize_image_quality(options.get("quality"))),
                "maxWidth": str(sanitize_image_dimension(options.get("maxWidth"), "maxWidth") or ""),
                "maxHeight": str(sanitize_image_dimension(options.get("maxHeight"), "maxHeight") or ""),
                "keepRatio": str(sanitize_image_keep_ratio(options.get("keepRatio"))).lower(),
                "watermarkText": sanitize_image_watermark_text(options.get("watermarkText")),
                "watermarkPosition": sanitize_image_watermark_position(options.get("watermarkPosition")),
            }
        if job_type == "ocr-image":
            from .conversion_service import sanitize_image_ops, sanitize_ocr_language

            language = sanitize_ocr_language(options.get("language"))
            image_ops = sanitize_image_ops(options.get("imageOps") or "", input_count)
            return {
                "language": language,
                "imageOps": json.dumps(image_ops, ensure_ascii=False, separators=(",", ":")),
            }
        if job_type == "ocr-pdf":
            from .conversion_service import sanitize_ocr_page_selection

            language = (options.get("language") or "chi_tra+eng").strip() or "chi_tra+eng"
            raw_pages = (options.get("maxPages") or str(OCR_PDF_MAX_PAGES_DEFAULT)).strip()
            try:
                max_pages = int(raw_pages)
            except ValueError as error:
                raise ValueError("maxPages must be an integer") from error
            if max_pages < 1:
                raise ValueError("maxPages must be at least 1")
            max_pages = min(max_pages, OCR_PDF_MAX_PAGES_HARD_LIMIT)
            pages = (options.get("pages") or "").strip()
            sanitize_ocr_page_selection(pages)
            return {"language": language, "maxPages": str(max_pages), "pages": pages}
        if job_type == "pdf-to-searchable-pdf":
            language = (options.get("language") or "chi_tra+eng").strip() or "chi_tra+eng"
            raw_pages = (options.get("maxPages") or str(OCR_PDF_MAX_PAGES_DEFAULT)).strip()
            try:
                max_pages = int(raw_pages)
            except ValueError as error:
                raise ValueError("maxPages must be an integer") from error
            if max_pages < 1:
                raise ValueError("maxPages must be at least 1")
            max_pages = min(max_pages, OCR_PDF_MAX_PAGES_HARD_LIMIT)
            return {"language": language, "maxPages": str(max_pages)}
        if job_type == "pdf-to-docx":
            return {}
        if job_type == "pdf-to-office":
            from .conversion_service import (
                sanitize_docx_engine,
                sanitize_ocr_output,
                sanitize_scan_ocr,
            )

            ext = sanitize_extension(options.get("extension") or "docx")
            if ext not in ALLOWED_PDF_TO_OFFICE_EXTENSIONS:
                raise ValueError(f"Unsupported Office format: {ext}. Allowed: docx, xlsx, pptx, odt")
            engine = sanitize_docx_engine(options.get("docxEngine") or "auto")
            if engine == "compat" and ext != "docx":
                raise ValueError("相容模式（docxEngine=compat）僅適用於 DOCX")
            scan = sanitize_scan_ocr(options.get("scanOcr") or "auto")
            ocr_out = sanitize_ocr_output(options.get("ocrOutput") or "both")
            if ocr_out == "searchable" and ext != "docx":
                raise ValueError("僅可搜尋 PDF 輸出僅適用於 DOCX／掃描 OCR 流程")
            language = (options.get("language") or "chi_tra+eng").strip() or "chi_tra+eng"
            raw_pages = (options.get("maxPages") or str(OCR_PDF_MAX_PAGES_DEFAULT)).strip()
            try:
                max_pages = int(raw_pages)
            except ValueError as error:
                raise ValueError("maxPages must be an integer") from error
            max_pages = max(1, min(max_pages, OCR_PDF_MAX_PAGES_HARD_LIMIT))
            return {
                "extension": ext,
                "docxEngine": engine,
                "scanOcr": scan,
                "ocrOutput": ocr_out,
                "language": language,
                "maxPages": str(max_pages),
            }
        if job_type == "pdf-merge":
            return {}
        if job_type == "pdf-split":
            pages = (options.get("pages") or "").strip()
            if not pages:
                raise ValueError("Page ranges are required for PDF split (example: 1-3,5,7-9)")
            return {"pages": pages}
        if job_type == "pdf-rotate":
            raw = (options.get("angle") or "90").strip()
            if raw not in {"90", "180", "270"}:
                raise ValueError("Rotation angle must be 90, 180, or 270")
            return {"angle": raw}
        if job_type == "pdf-encrypt":
            password = (options.get("password") or "").strip()
            if not password:
                raise ValueError("PDF 加密需要設定密碼")
            if len(password) > 256:
                raise ValueError("密碼長度不能超過 256 字元")
            return {"password": password}
        if job_type == "pdf-decrypt":
            return {"password": (options.get("password") or "").strip()}
        if job_type == "pdf-compress":
            return {}
        return {}


def _path_size_bytes(path: Path) -> int | None:
    try:
        if path.exists() and path.is_file():
            return path.stat().st_size
    except OSError:
        return None
    return None


def compute_job_space_usage(
    input_paths: list[Path] | None,
    output_paths: list[Path] | None,
) -> dict[str, object]:
    inputs: list[dict[str, object]] = []
    input_bytes = 0
    input_missing = 0
    for raw in input_paths or []:
        path = Path(raw)
        size = _path_size_bytes(path)
        name = path.name or str(path) or "(unknown)"
        if size is None:
            input_missing += 1
            inputs.append({"name": name, "size": None, "missing": True})
        else:
            input_bytes += size
            inputs.append({"name": name, "size": size, "missing": False})

    outputs: list[dict[str, object]] = []
    output_bytes = 0
    for raw in output_paths or []:
        path = Path(raw)
        size = _path_size_bytes(path)
        if size is None:
            continue
        output_bytes += size
        outputs.append({"name": path.name, "size": size, "path": str(path)})

    saved_bytes: int | None = None
    saved_percent: int | None = None
    if input_bytes > 0 and outputs:
        saved_bytes = input_bytes - output_bytes
        # Match JS Math.round (half away from zero), not Python banker's round.
        ratio = (saved_bytes / input_bytes) * 100
        saved_percent = int(ratio + 0.5) if ratio >= 0 else int(ratio - 0.5)

    return {
        "inputBytes": input_bytes,
        "outputBytes": output_bytes,
        "inputCount": len(inputs),
        "outputCount": len(outputs),
        "inputMissing": input_missing,
        "savedBytes": saved_bytes,
        "savedPercent": saved_percent,
        "inputs": inputs,
        "outputs": outputs,
    }


def _parse_iso_timestamp(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        # Support trailing Z and bare timestamps.
        normalized = text.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def format_bytes(value: int) -> str:
    if value >= 1024 ** 3:
        return f"{value / 1024 ** 3:.1f} GB"
    if value >= 1024 ** 2:
        return f"{value / 1024 ** 2:.1f} MB"
    return f"{max(1, (value + 1023) // 1024)} KB"


def sanitize_filename(filename: str) -> str:
    normalized = unicodedata.normalize("NFC", filename)
    cleaned = "".join(
        "_" if char in '\\/:*?"<>|' or ord(char) < 32 else char
        for char in normalized
    ).strip(" .")
    cleaned = cleaned or "file"
    path = Path(cleaned)
    suffix = path.suffix if len(path.suffix.encode("utf-8")) <= 20 else ""
    stem = (cleaned[: -len(suffix)] if suffix else cleaned).rstrip(" .") or "file"
    if stem.casefold() in {
        "con", "prn", "aux", "nul",
        *(f"com{index}" for index in range(1, 10)),
        *(f"lpt{index}" for index in range(1, 10)),
    }:
        stem = f"_{stem}"
    return fit_filename_component(f"{stem}{suffix}")


def fit_filename_component(filename: str, collision_suffix: str = "", max_bytes: int = 200) -> str:
    path = Path(unicodedata.normalize("NFC", filename or "file"))
    suffix = path.suffix if len(path.suffix.encode("utf-8")) <= 20 else ""
    stem = (path.name[: -len(suffix)] if suffix else path.name).rstrip(" .") or "file"
    budget = max(1, max_bytes - len(suffix.encode("utf-8")) - len(collision_suffix.encode("utf-8")))
    fitted = ""
    for character in stem:
        if len((fitted + character).encode("utf-8")) > budget:
            break
        fitted += character
    return f"{fitted.rstrip(' .') or 'file'}{collision_suffix}{suffix}"


def unique_name(filename: str, used_names: set[str]) -> str:
    candidate = fit_filename_component(filename)
    index = 2
    while unicodedata.normalize("NFC", candidate).casefold() in used_names:
        candidate = fit_filename_component(filename, f"_{index}")
        index += 1
    used_names.add(unicodedata.normalize("NFC", candidate).casefold())
    return candidate


job_service = JobService()
