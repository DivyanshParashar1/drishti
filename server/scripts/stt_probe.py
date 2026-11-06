"""Stream a 16 kHz mono 16-bit WAV through the running server's /stt at real-time pace.

    uv run python scripts/stt_probe.py tests/fixtures/stt/hi-en_question.wav --lang hi-en

Prints the final transcript and the time from "end" (button release) to the final message.
"""

import argparse
import asyncio
import json
import time
import wave

import websockets
from _common import auth_headers, server_url

CHUNK_MS = 20


async def main(path: str, lang: str) -> None:
    with wave.open(path, "rb") as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2, (
            "need 16 kHz mono 16-bit WAV"
        )
        pcm = w.readframes(w.getnframes())
    step = 16000 * 2 * CHUNK_MS // 1000
    url = server_url().replace("http", "ws", 1) + "/stt"
    async with websockets.connect(url, additional_headers=auth_headers()) as ws:
        await ws.send(json.dumps({"lang": lang}))
        for i in range(0, len(pcm), step):
            await ws.send(pcm[i : i + step])
            await asyncio.sleep(CHUNK_MS / 1000)
        released = time.perf_counter()
        await ws.send(json.dumps({"type": "end"}))
        msg = json.loads(await ws.recv())
        ms = (time.perf_counter() - released) * 1000
    print(json.dumps(msg, ensure_ascii=False), f"| release->final {ms:.0f} ms")


ap = argparse.ArgumentParser()
ap.add_argument("wav")
ap.add_argument("--lang", default="hi-en")
a = ap.parse_args()
asyncio.run(main(a.wav, a.lang))
