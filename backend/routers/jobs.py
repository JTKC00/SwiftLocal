from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from ..services.job_service import job_service


router = APIRouter(tags=["jobs"])


@router.post("/jobs")
async def create_job(
    type: str = Form(...),
    files: list[UploadFile] | None = File(None),
    extension: str = Form(""),
    language: str = Form(""),
    pages: str = Form(""),
    angle: str = Form(""),
    password: str = Form(""),
    maxPages: str = Form(""),
    videoBitrate: str = Form(""),
    audioBitrate: str = Form(""),
    scale: str = Form(""),
    crop: str = Form(""),
    start: str = Form(""),
    duration: str = Form(""),
    gifFps: str = Form(""),
    docxEngine: str = Form("auto"),
    scanOcr: str = Form("auto"),
    ocrOutput: str = Form("both"),
    imageOps: str = Form(""),
    quality: str = Form(""),
    maxWidth: str = Form(""),
    maxHeight: str = Form(""),
    keepRatio: str = Form("true"),
    watermarkText: str = Form(""),
    watermarkPosition: str = Form("se"),
):
    try:
        return await job_service.create_job(
            job_type=type,
            files=files or [],
            options={
                "extension": extension,
                "language": language,
                "pages": pages,
                "angle": angle,
                "password": password,
                "maxPages": maxPages,
                "videoBitrate": videoBitrate,
                "audioBitrate": audioBitrate,
                "scale": scale,
                "crop": crop,
                "start": start,
                "duration": duration,
                "gifFps": gifFps,
                "docxEngine": docxEngine,
                "scanOcr": scanOcr,
                "ocrOutput": ocrOutput,
                "imageOps": imageOps,
                "quality": quality,
                "maxWidth": maxWidth,
                "maxHeight": maxHeight,
                "keepRatio": keepRatio,
                "watermarkText": watermarkText,
                "watermarkPosition": watermarkPosition,
            },
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/jobs")
async def list_jobs():
    return job_service.list_jobs()


@router.post("/jobs/cleanup")
async def cleanup_jobs(forceFinished: bool = Query(False, alias="forceFinished")):
    """Auto-prune old finished jobs and orphan workdirs under backend/temp/jobs."""
    return job_service.prune_jobs(force_finished=forceFinished)


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/jobs/{job_id}/outputs/{filename}")
async def download_output(job_id: str, filename: str):
    output_path = job_service.output_path(job_id, filename)
    if not output_path:
        raise HTTPException(status_code=404, detail="Output not found")
    return FileResponse(output_path, filename=output_path.name)


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    try:
        job = await job_service.cancel_job(job_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs/{job_id}/retry")
async def retry_job(job_id: str):
    try:
        job = await job_service.retry_job(job_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs/{job_id}/copy")
async def copy_job(job_id: str):
    try:
        job = await job_service.copy_job(job_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/jobs/{job_id}/diagnostic")
async def job_diagnostic(job_id: str):
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return await job_service.diagnostic_report(job_id)


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    try:
        removed = await job_service.delete_job(job_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if not removed:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True}
