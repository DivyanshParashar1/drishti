import os
import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))


def server_url() -> str:
    return os.environ.get("SERVER_URL", "http://localhost:8000").rstrip("/")


def auth_headers() -> dict[str, str]:
    from app.settings import Settings

    return {"Authorization": f"Bearer {Settings().app_token}"}
