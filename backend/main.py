from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .routers import jobs, tools
from .routers.text import router as text_router
from .security import ALLOWED_FRONTEND_ORIGINS, SESSION_TOKEN, is_valid_session_token
from .services.job_service import job_service
from .version import APP_VERSION


ROOT_DIR = Path(__file__).resolve().parent
TEMP_DIR = ROOT_DIR / "temp"
SESSION_TOKEN_PATH = TEMP_DIR / "session-token"
class SessionTokenMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/api") and request.method != "OPTIONS":
            if not is_valid_session_token(request.headers.get("X-SwiftLocal-Token")):
                return JSONResponse(status_code=401, content={"detail": "Invalid or missing SwiftLocal session token"})
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    (TEMP_DIR / "jobs").mkdir(parents=True, exist_ok=True)
    SESSION_TOKEN_PATH.write_text(SESSION_TOKEN, encoding="utf-8")
    try:
        SESSION_TOKEN_PATH.chmod(0o600)
    except OSError:
        pass
    # Restore queue / results from previous run (interrupted running jobs → failed).
    await job_service.restore_state()
    try:
        yield
    finally:
        try:
            if SESSION_TOKEN_PATH.read_text(encoding="utf-8") == SESSION_TOKEN:
                SESSION_TOKEN_PATH.unlink(missing_ok=True)
        except OSError:
            pass


app = FastAPI(title="SwiftLocal Backend", version=APP_VERSION, lifespan=lifespan)

app.add_middleware(SessionTokenMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ALLOWED_FRONTEND_ORIGINS),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-SwiftLocal-Token"],
)

app.include_router(tools.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(text_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"ok": True, "service": "swiftlocal-backend"}
