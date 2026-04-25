import asyncio
import shutil
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile

from .conversion_service import (
    convert_media,
    convert_office_to_pdf,
    convert_pdf_to_docx,
    merge_pdfs,
    ocr_images,
    rotate_pdf,
    sanitize_extension,
    split_pdf,
)


ROOT_DIR = Path(__file__).resolve().parents[1]
TEMP_DIR = ROOT_DIR / "temp"
JOBS_DIR = TEMP_DIR / "jobs"
SUPPORTED_JOB_TYPES = {"office-to-pdf", "media-convert", "ocr-image", "pdf-to-docx", "pdf-merge", "pdf-split", "pdf-rotate"}


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


class JobService:
    def __init__(self):
        self.jobs: list[Job] = []
        self.running = False
        self.lock = asyncio.Lock()

    async def cleanup_all(self) -> None:
        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        for child in JOBS_DIR.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)

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
        self.jobs = [item for item in self.jobs if item.id != job_id]
        shutil.rmtree(JOBS_DIR / job_id, ignore_errors=True)
        return True

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

    async def _run_job(self, job: Job) -> None:
        job.status = "running"
        job.started_at = now_iso()
        try:
            if job.type == "office-to-pdf":
                outputs, logs = await convert_office_to_pdf(job.input_paths, job.output_dir)
            elif job.type == "media-convert":
                outputs, logs = await convert_media(job.input_paths, job.output_dir, job.options["extension"])
            elif job.type == "ocr-image":
                outputs, logs = await ocr_images(job.input_paths, job.output_dir, job.options["language"])
            elif job.type == "pdf-to-docx":
                outputs, logs = await convert_pdf_to_docx(job.input_paths, job.output_dir)
            elif job.type == "pdf-merge":
                outputs, logs = await merge_pdfs(job.input_paths, job.output_dir)
            elif job.type == "pdf-split":
                outputs, logs = await split_pdf(job.input_paths, job.output_dir, job.options["pages"])
            elif job.type == "pdf-rotate":
                outputs, logs = await rotate_pdf(job.input_paths, job.output_dir, int(job.options["angle"]))
            else:
                raise RuntimeError(f"Unsupported job type: {job.type}")

            job.output_paths = [path for path in outputs if path.exists()]
            job.log.extend(log for log in logs if log)
            if not job.output_paths:
                raise RuntimeError("Conversion finished but no output file was created")
            job.status = "done"
        except Exception as error:
            job.error = str(error)
            job.log.append(job.error)
            job.status = "failed"
        finally:
            job.finished_at = now_iso()

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
            return {"extension": sanitize_extension(options.get("extension") or "mp4")}
        if job_type == "ocr-image":
            language = (options.get("language") or "eng").strip()
            return {"language": language or "eng"}
        if job_type == "pdf-to-docx":
            return {}
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
