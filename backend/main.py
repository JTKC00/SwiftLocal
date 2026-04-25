from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import jobs, tools
from .routers.text import router as text_router
from .services.job_service import job_service


ROOT_DIR = Path(__file__).resolve().parent
TEMP_DIR = ROOT_DIR / "temp"


@asynccontextmanager
async def lifespan(app: FastAPI):
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    (TEMP_DIR / "jobs").mkdir(parents=True, exist_ok=True)
    await job_service.cleanup_all()
    yield


app = FastAPI(title="SwiftLocal Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:4173",
        "http://localhost:4173",
        "null",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(tools.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(text_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"ok": True, "service": "swiftlocal-backend"}
