"""Replay the recorded fixture clips. Offline: fake Prisma returns the recorded transcript.
Live (`uv run pytest -m live`): the real Prisma must still return it (spends STT credits)."""

import asyncio
import json
import math
import re
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.gnani.framing import FRAME_BYTES
from app.gnani.stt import build_headers, websockets_connector
from app.main import create_app
from app.settings import Settings
from tests.conftest import AUTH
from tests.fake_prisma import FakePrisma

FIX = Path(__file__).parent / "fixtures" / "stt"
CASES = {k: v for k, v in json.loads((FIX / "sentences.json").read_text()).items() if k != "_note"}


def pcm(name: str) -> bytes:
    with wave.open(str(FIX / f"{name}.wav")) as w:
        assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (16000, 1, 2)
        return w.readframes(w.getnframes())


def norm(text: str) -> str:
    return " ".join(re.sub(r"[^\w\s]", "", text).lower().split())


@pytest.mark.parametrize("name", sorted(CASES))
def test_replay_through_relay(settings, name):
    case, audio = CASES[name], pcm(name)
    prisma = FakePrisma(
        on_frames={3: [{"type": "speech_start"}]},
        on_commit=[{"type": "transcript", "text": case["prisma"]}],
    )
    client = TestClient(create_app(settings, stt_connector=prisma))
    with client.websocket_connect("/stt", headers=AUTH) as ws:
        ws.send_text(json.dumps({"lang": case["lang"]}))
        for i in range(0, len(audio), 640):
            ws.send_bytes(audio[i : i + 640])
        ws.send_text(json.dumps({"type": "end"}))
        assert ws.receive_json()["text"] == case["prisma"]
    assert len(prisma.frames) == math.ceil(len(audio) / FRAME_BYTES)
    assert all(len(f) == FRAME_BYTES for f in prisma.frames)


@pytest.mark.live
@pytest.mark.parametrize("name", sorted(CASES))
def test_live_prisma_still_matches(name):
    s = Settings()
    if not s.gnani_api_key:
        pytest.skip("GNANI_API_KEY not set")
    case, audio = CASES[name], pcm(name)

    async def go() -> str:
        from app.gnani.stt import SttSession

        async with websockets_connector(
            s.gnani_stt_url, build_headers(s.gnani_api_key, case["lang"])
        ) as conn:
            session = SttSession(conn, 5.0)
            for i in range(0, len(audio), 640):
                await session.push(audio[i : i + 640])
                await asyncio.sleep(0.02)
            state = await session.finish()
            await session.close()
            return state.text

    assert norm(asyncio.run(go())) == norm(case["prisma"])
