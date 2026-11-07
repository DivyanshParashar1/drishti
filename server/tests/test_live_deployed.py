"""Live smoke test against the deployed relay (P13). Spends one /tts call of Gnani credits.

    DEPLOYED_URL=https://drishti-relay-….run.app APP_TOKEN=… uv run pytest -m live tests/test_live_deployed.py
"""

import os

import httpx
import pytest

pytestmark = pytest.mark.live

URL = os.environ.get("DEPLOYED_URL", "").rstrip("/")
TOKEN = os.environ.get("APP_TOKEN", "")


@pytest.fixture(scope="module")
def client():
    if not URL or not TOKEN:
        pytest.skip("set DEPLOYED_URL and APP_TOKEN")
    with httpx.Client(base_url=URL, timeout=20) as c:
        yield c


def test_health_with_token(client):
    r = client.get("/health", headers={"Authorization": f"Bearer {TOKEN}"})
    assert r.status_code == 200


def test_rejects_missing_and_wrong_token(client):
    assert client.get("/health").status_code == 401
    assert client.get("/health", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_one_tts(client):
    r = client.post(
        "/tts",
        json={"text": "Namaste, main Drishti hoon.", "lang": "hi-en"},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/mpeg")
    assert len(r.content) > 1000
