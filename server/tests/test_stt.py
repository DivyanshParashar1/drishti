import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.gnani.framing import FRAME_BYTES
from app.gnani.stt import build_headers
from app.main import create_app
from tests.conftest import AUTH
from tests.fake_prisma import FakePrisma

CHUNK = bytes(640)  # 20 ms at 16 kHz


def T(text, **kw):
    return {"type": "transcript", "text": text, **kw}


def run(settings, prisma, chunks=10, lang="hi-en", send_end=True):
    client = TestClient(create_app(settings, stt_connector=prisma))
    with client.websocket_connect("/stt", headers=AUTH) as ws:
        ws.send_text(json.dumps({"lang": lang}))
        for _ in range(chunks):
            ws.send_bytes(CHUNK)
        if send_end:
            ws.send_text(json.dumps({"type": "end"}))
        return ws.receive_json()


def test_headers_follow_the_docs():
    h = build_headers("key", "hi-en")
    assert h["x-api-key-id"] == "key"
    assert h["model"] == "prisma-v3.0"
    assert h["language_code"] == "hi-IN,en-IN"
    assert h["format"] == "codemix"
    assert h["x-sample-rate"] == "16000"


def test_final_transcript_after_commit(settings):
    prisma = FakePrisma(
        on_frames={2: [{"type": "speech_start"}]},
        on_commit=[{"type": "processing"}, T("saamne kya hai", detected_language_code="hi-IN")],
    )
    out = run(settings, prisma)
    assert out == {"type": "final", "text": "saamne kya hai", "lang": "hi-en", "detected": "hi-IN"}
    assert prisma.texts[-1] == json.dumps({"type": "commit"})


def test_audio_is_reframed_to_1024_bytes_and_tail_padded(settings):
    prisma = FakePrisma(on_commit=[])
    run(settings, prisma, chunks=10)  # 6,400 bytes → 6 full frames + 256-byte tail
    assert [len(f) for f in prisma.frames] == [FRAME_BYTES] * 7
    assert b"".join(prisma.frames)[: 10 * len(CHUNK)] == CHUNK * 10


def test_segments_before_release_are_joined(settings):
    prisma = FakePrisma(
        on_frames={1: [{"type": "speech_start"}], 3: [T("ye bus"), {"type": "speech_start"}]},
        on_commit=[T("kaunsi hai")],
    )
    assert run(settings, prisma)["text"] == "ye bus kaunsi hai"


def test_no_speech_returns_empty_final_quickly(settings):
    prisma = FakePrisma(on_commit=[])
    out = run(settings, prisma)
    assert out["type"] == "final" and out["text"] == ""


def test_waits_for_slow_transcript_within_timeout(settings):
    prisma = FakePrisma(
        on_frames={1: [{"type": "speech_start"}]}, on_commit=[T("ruko")], commit_delay=0.5
    )
    assert run(settings, prisma)["text"] == "ruko"


def test_gives_up_at_final_timeout(settings):
    settings.stt_final_timeout_s = 0.3
    prisma = FakePrisma(on_frames={1: [{"type": "speech_start"}]}, on_commit=[])
    out = run(settings, prisma)
    assert out == {"type": "final", "text": "", "lang": "hi-en", "detected": None}


def test_upstream_error_then_close_is_reported(settings):
    prisma = FakePrisma(on_commit=[{"type": "error", "message": "boom"}, None])
    assert run(settings, prisma) == {"type": "error", "code": "stt_error"}


def test_upstream_dies_mid_hold(settings):
    prisma = FakePrisma(on_frames={2: [{"type": "error", "message": "cap"}]}, close_after_frames=2)
    assert run(settings, prisma, chunks=20) == {"type": "error", "code": "stt_error"}


@pytest.mark.parametrize(
    "code", ["gnani_auth", "credits_exhausted", "rate_limited", "upstream_unreachable"]
)
def test_handshake_refusal(settings, code):
    assert run(settings, FakePrisma(handshake_error=code)) == {"type": "error", "code": code}


@pytest.mark.parametrize("first", ["not json", json.dumps({"lang": "fr"}), json.dumps([1])])
def test_bad_start_frame(settings, first):
    prisma = FakePrisma()
    client = TestClient(create_app(settings, stt_connector=prisma))
    with client.websocket_connect("/stt", headers=AUTH) as ws:
        ws.send_text(first)
        assert ws.receive_json() == {"type": "error", "code": "bad_request"}
    assert prisma.headers is None  # never opened a paid upstream session


def test_language_reaches_upstream(settings):
    prisma = FakePrisma(on_commit=[T("vanakkam")])
    run(settings, prisma, lang="ta")
    assert prisma.headers["language_code"] == "ta-IN"


def test_logs_have_no_transcript(settings, caplog):
    prisma = FakePrisma(
        on_frames={1: [{"type": "speech_start"}]}, on_commit=[T("Rahul ko save karo")]
    )
    with caplog.at_level(logging.INFO, logger="drishti"):
        run(settings, prisma)
    assert "stt code=ok lang=hi-en count=1" in caplog.text
    assert "Rahul" not in caplog.text


def test_requires_token(settings):
    from starlette.testclient import WebSocketDenialResponse

    client = TestClient(create_app(settings, stt_connector=FakePrisma()))
    with pytest.raises(WebSocketDenialResponse), client.websocket_connect("/stt"):
        pass
