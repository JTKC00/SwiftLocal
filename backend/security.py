import hmac
import os
import secrets


SESSION_TOKEN = os.environ.get("SWIFTLOCAL_SESSION_TOKEN") or secrets.token_urlsafe(32)
ALLOWED_FRONTEND_ORIGINS = tuple(
    origin.strip()
    for origin in os.environ.get(
        "SWIFTLOCAL_FRONTEND_ORIGINS",
        "http://127.0.0.1:4173,http://localhost:4173",
    ).split(",")
    if origin.strip() and origin.strip() != "null"
)


def is_valid_session_token(value: str | None) -> bool:
    return bool(value) and hmac.compare_digest(value, SESSION_TOKEN)
