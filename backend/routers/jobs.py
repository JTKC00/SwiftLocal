from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..services.job_service import job_service


router = APIRouter(tags=["jobs"])


@router.post("/jobs")
async def create_job(
    type: str = Form(...),
    files: list[UploadFile] = File(...),
    extension: str = Form(""),
    language: str = Form(""),
):
    try:
        return await job_service.create_job(
            job_type=type,
            files=files,
            options={"extension": extension, "language": language},
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/jobs")
async def list_jobs():
    return job_service.list_jobs()


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


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    removed = await job_service.delete_job(job_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True}
