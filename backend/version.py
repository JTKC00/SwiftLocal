import json
from pathlib import Path


PACKAGE_JSON_PATH = Path(__file__).resolve().parents[1] / "package.json"


def read_app_version() -> str:
    try:
        payload = json.loads(PACKAGE_JSON_PATH.read_text(encoding="utf-8"))
        version = str(payload.get("version") or "").strip()
        return version or "0.0.0"
    except (OSError, ValueError, TypeError):
        return "0.0.0"


APP_VERSION = read_app_version()
