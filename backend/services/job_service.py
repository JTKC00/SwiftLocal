from __future__ import annotations

import asyncio
import json
import shutil
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


ROOT_DIR = Path(__file__).resolve().parents[1]
TEMP_DIR = ROOT_DIR / "temp"
JOBS_DIR = TEMP_DIR / "jobs"
JOBS_STATE_PATH = TEMP_DIR / "jobs-state.json"
MAX_PERSISTED_JOBS = 80
SUPPORTED_JOB_TYPES = {
    "office-to-pdf", "pdf-to-office", "media-convert", "ocr-image", "ocr-pdf",
    "pdf-to-docx", "pdf-merge", "pdf-split", "pdf-rotate",
    "image-convert", "pdf-encrypt", "pdf-decrypt", "pdf-compress",
}


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
    cancel_requested: bool = False


class JobService:
    def __init__(self):
        self.jobs: list[Job] = []
        self.running = False
        self.lock = asyncio.Lock()

    async def cleanup_all(self) -> None:
        """Legacy wipe — prefer restore_state() for persistence-aware startup."""
        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        for child in JOBS_DIR.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
        if JOBS_STATE_PATH.exists():
            JOBS_STATE_PATH.unlink(missing_ok=True)
        self.jobs = []

    async def restore_state(self) -> None:
        """Load persisted jobs, repair interrupted ones, prune orphan job dirs, resume queue."""
        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        TEMP_DIR.mkdir(parents=True, exist_ok=True)
        self.jobs = self._load_jobs_state()
        known_ids = {job.id for job in self.jobs}
        for child in list(JOBS_DIR.iterdir()):
            if child.is_dir() and child.name not in known_ids:
                # Keep dirs that still match a known id only; drop orphans.
                shutil.rmtree(child, ignore_errors=True)
        self._save_jobs_state()
        if any(job.status == "queued" for job in self.jobs):
            asyncio.create_task(self._run_next())

    def _load_jobs_state(self) -> list[Job]:
        try:
            raw = json.loads(JOBS_STATE_PATH.read_text(encoding="utf-8"))
        except Exception:
            return []
        items = raw if isinstance(raw, list) else raw.get("jobs") if isinstance(raw, dict) else None
        if not isinstance(items, list):
            return []
        jobs: list[Job] = []
        for item in items[:MAX_PERSISTED_JOBS]:
            job = self._job_from_dict(item)
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

        if status == "running":
            status = "failed"
            error = error or "後端重啟時任務中斷"
            log.append(error)
            finished_at = finished_at or now_iso()

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

        options = item.get("options") if isinstance(item.get("options"), dict) else {}
        options = {str(k): str(v) for k, v in options.items()}
        output_dir_raw = item.get("outputDir") or item.get("output_dir") or str(JOBS_DIR / job_id / "output")
        output_dir = Path(str(output_dir_raw))

        return Job(
            id=job_id,
            type=job_type,
            input_paths=input_paths,
            output_dir=output_dir,
            options=options,
            status=status,
            created_at=created_at,
            started_at=str(started_at) if started_at else None,
            finished_at=str(finished_at) if finished_at else None,
            output_paths=output_paths,
            log=log,
            error=error,
            cancel_requested=False,
        )

    def _serialize_job(self, job: Job) -> dict:
        return {
            "id": job.id,
            "type": job.type,
            "inputPaths": [str(path) for path in job.input_paths],
            "outputDir": str(job.output_dir),
            "options": job.options,
            "status": job.status,
            "createdAt": job.created_at,
            "startedAt": job.started_at,
            "finishedAt": job.finished_at,
            "outputPaths": [str(path) for path in job.output_paths],
            "log": job.log[-12:],
            "error": job.error,
        }

    def _save_jobs_state(self) -> None:
        try:
            TEMP_DIR.mkdir(parents=True, exist_ok=True)
            payload = {
                "version": 1,
                "savedAt": now_iso(),
                "jobs": [self._serialize_job(job) for job in self.jobs[:MAX_PERSISTED_JOBS]],
            }
            JOBS_STATE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError:
            pass

    async def create_job(self, job_type: str, files: list[UploadFile], options: dict[str, str]) -> dict:
        if job_type not in SUPPORTED_JOB_TYPES:
            raise ValueError(f"Unsupported job type: {job_type}")
        if not files:
            raise ValueError("At least one file is required")

        clean_options = self._validate_options(job_type, options)
        job_id = uuid.uuid4().hex
        job_dir = JOBS_DIR / job_id
        input_dir = job_dir / "input"
        output_dir = job_dir / "output"
        input_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)

        input_paths = []
        used_names: set[str] = set()
        for upload in files:
            filename = unique_name(sanitize_filename(upload.filename or "file"), used_names)
            input_path = input_dir / filename
            with input_path.open("wb") as target:
                while chunk := await upload.read(1024 * 1024):
                    target.write(chunk)
            input_paths.append(input_path)

        job = Job(
            id=job_id,
            type=job_type,
            input_paths=input_paths,
            output_dir=output_dir,
            options=clean_options,
        )
        self.jobs.insert(0, job)
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
            job.log.append(job.error)
            job.finished_at = now_iso()
            self._save_jobs_state()
            return self.public_job(job)
        if job.status == "running":
            job.cancel_requested = True
            request_cancel(job.id)
            job.log.append(
                "取消請求已送出：外部工具（FFmpeg／LibreOffice／Tesseract 等）會盡快中止；"
                "本機純處理步驟需等目前段落結束。"
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
        self._save_jobs_state()
        begin_job(job.id)
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
                outputs, logs = await ocr_images(job.input_paths, job.output_dir, job.options["language"])
            elif job.type == "ocr-pdf":
                outputs, logs = await ocr_pdf(
                    job.input_paths,
                    job.output_dir,
                    job.options["language"],
                    int(job.options.get("maxPages") or OCR_PDF_MAX_PAGES_DEFAULT),
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
                outputs, logs = await convert_pdf_to_office(job.input_paths, job.output_dir, job.options["extension"])
            elif job.type == "image-convert":
                outputs, logs = await convert_image(job.input_paths, job.output_dir, job.options["extension"])
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
        except JobCancelled as error:
            job.error = str(error) or "任務已取消"
            job.log.append(job.error)
            job.status = "cancelled"
        except Exception as error:
            if job.cancel_requested:
                job.error = "任務已取消"
                job.log.append(job.error)
                job.status = "cancelled"
            else:
                job.error = str(error)
                job.log.append(job.error)
                job.status = "failed"
        finally:
            end_job(job.id)
            job.finished_at = now_iso()
            self._save_jobs_state()

    def public_job(self, job: Job) -> dict:
        return {
            "id": job.id,
            "type": job.type,
            "inputPaths": [path.name for path in job.input_paths],
            "outputPaths": [self._public_output(job, path) for path in job.output_paths if path.exists()],
            "options": job.options,
            "status": job.status,
            "createdAt": job.created_at,
            "startedAt": job.started_at,
            "finishedAt": job.finished_at,
            "log": job.log[-6:],
            "error": job.error,
        }

    def _public_output(self, job: Job, output_path: Path) -> dict[str, str | int]:
        return {
            "name": output_path.name,
            "size": output_path.stat().st_size,
            "url": f"/api/jobs/{job.id}/outputs/{output_path.name}",
        }

    def _find_job(self, job_id: str) -> Job | None:
        return next((job for job in self.jobs if job.id == job_id), None)

    def _validate_options(self, job_type: str, options: dict[str, str]) -> dict[str, str]:
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
            return {"extension": sanitize_extension(options.get("extension") or "jpg")}
        if job_type == "ocr-image":
            language = (options.get("language") or "eng").strip()
            return {"language": language or "eng"}
        if job_type == "ocr-pdf":
            language = (options.get("language") or "eng").strip() or "eng"
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
            ext = sanitize_extension(options.get("extension") or "docx")
            if ext not in ALLOWED_PDF_TO_OFFICE_EXTENSIONS:
                raise ValueError(f"Unsupported Office format: {ext}. Allowed: docx, xlsx, pptx, odt")
            return {"extension": ext}
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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sanitize_filename(filename: str) -> str:
    cleaned = "".join("_" if char in '\\/:*?"<>|' else char for char in filename).strip()
    cleaned = cleaned.strip(".")
    return cleaned or "file"


def unique_name(filename: str, used_names: set[str]) -> str:
    path = Path(filename)
    stem = path.stem or "file"
    suffix = path.suffix
    candidate = filename
    index = 2
    while candidate.lower() in used_names:
        candidate = f"{stem}_{index}{suffix}"
        index += 1
    used_names.add(candidate.lower())
    return candidate


job_service = JobService()
