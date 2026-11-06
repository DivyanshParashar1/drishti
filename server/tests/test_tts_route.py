import logging

import pytest
from fastapi.testclient import TestClient

from app.gnani.errors import UpstreamError
from app.main import create_app
from tests.conftest import AUTH


class FakeTts:
    def __init__(self, result=b"ID3audio"):
        self.result = result
        self.calls = []

    async def synth(self, text, lang):
        self.calls.append((text, lang))
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


@pytest.fixture
def fake():
    return FakeTts()


@pytest.fixture
def client(settings, fake):
    return TestClient(create_app(settings, tts_client=fake))


def test_returns_mp3(client, fake):
    r = client.post("/tts", json={"text": "Kursi aage", "lang": "hi-en"}, headers=AUTH)
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/mpeg"
    assert r.content == b"ID3audio"
    assert fake.calls == [("Kursi aage", "hi-en")]


@pytest.mark.parametrize(
    "body",
    [
        {"text": "", "lang": "en"},
        {"text": "x" * 201, "lang": "en"},
        {"text": "hi", "lang": "fr"},
        {"lang": "en"},
    ],
)
def test_validation(client, fake, body):
    assert client.post("/tts", json=body, headers=AUTH).status_code == 422
    assert fake.calls == []


@pytest.mark.parametrize(
    "code,status",
    [
        ("rate_limited", 429),
        ("credits_exhausted", 503),
        ("gnani_auth", 502),
        ("upstream_timeout", 504),
        ("upstream_error", 502),
    ],
)
def test_upstream_errors(settings, code, status):
    c = TestClient(create_app(settings, tts_client=FakeTts(UpstreamError(code))))
    r = c.post("/tts", json={"text": "hi", "lang": "en"}, headers=AUTH)
    assert r.status_code == status
    assert r.json() == {"code": code}


def test_requires_token(client):
    assert client.post("/tts", json={"text": "hi", "lang": "en"}).status_code == 401


def test_logs_timing_not_text(client, caplog):
    with caplog.at_level(logging.INFO, logger="drishti"):
        client.post("/tts", json={"text": "Rahul aapke saamne hai", "lang": "hi-en"}, headers=AUTH)
    assert "tts code=ok lang=hi-en" in caplog.text
    assert "Rahul" not in caplog.text


def test_real_client_is_built_at_startup(settings):
    with TestClient(create_app(settings)) as c:
        assert type(c.app.state.tts).__name__ == "GnaniTts"
