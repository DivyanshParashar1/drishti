"""A/B the Prisma header configs on the same clips, straight to Prisma (spends STT credits).

    uv run python scripts/stt_ab.py --lang hi-en clip1.wav clip2.wav ...

Each clip is a 16 kHz mono 16-bit WAV, streamed at real-time pace once per config:
  plain    the 2026-11-06 headers
  vad      + x-vad-threshold 0.5
  context  + vad + keyterms + topic (what the server now sends)
"""

import argparse
import asyncio
import sys
import wave
from pathlib import Path

import websockets

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # the server package

from app.gnani.errors import UpstreamError
from app.gnani.stt import SttSession, build_headers, websockets_connector
from app.settings import Settings

CONFIGS = {
    "plain": {},
    "vad": {"vad_threshold": 0.5},
    "context": {"vad_threshold": 0.5, "context": True},
}


def pcm(path: str) -> bytes:
    with wave.open(path, "rb") as w:
        assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (16000, 1, 2), (
            f"{path}: need 16 kHz mono 16-bit WAV"
        )
        return w.readframes(w.getnframes())


async def transcribe(s: Settings, audio: bytes, lang: str, opts: dict) -> str:
    try:
        async with websockets_connector(s.gnani_stt_url, build_headers(s.gnani_api_key, lang, **opts)) as conn:
            session = SttSession(conn, 5.0)
            for i in range(0, len(audio), 640):
                await session.push(audio[i : i + 640])
                await asyncio.sleep(0.02)
            state = await session.finish()
            await session.close()
            return state.fatal or state.text or "(empty)"
    except (UpstreamError, websockets.ConnectionClosed) as e:
        return f"(refused: {e})"


async def main(paths: list[str], lang: str, only: list[str] | None) -> None:
    s = Settings()
    assert s.gnani_api_key, "GNANI_API_KEY not set (server/.env)"
    configs = {k: v for k, v in CONFIGS.items() if not only or k in only}
    for path in paths:
        audio = pcm(path)
        print(f"\n{path}")
        for name, opts in configs.items():
            print(f"  {name:8} {await transcribe(s, audio, lang, opts)}")


ap = argparse.ArgumentParser()
ap.add_argument("wavs", nargs="+")
ap.add_argument("--lang", default="hi-en")
ap.add_argument("--only", nargs="*", help="subset of configs: plain vad context")
a = ap.parse_args()
asyncio.run(main(a.wavs, a.lang, a.only))
