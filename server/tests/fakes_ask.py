"""Fake VLM and Timbre for /ask tests, plus a minimal JPEG header of any size."""

import asyncio

from app.gnani.errors import UpstreamError
from app.vlm.base import VlmError


def jpeg(width: int = 512, height: int = 384) -> bytes:
    app0 = b"\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    sof0 = (
        b"\xff\xc0\x00\x11\x08"
        + height.to_bytes(2, "big")
        + width.to_bytes(2, "big")
        + b"\x03\x01\x22\x00\x02\x11\x01\x03\x11\x01"
    )
    return b"\xff\xd8" + app0 + sof0 + b"\xff\xda\x00\x08rest\xff\xd9"


class FakeVlm:
    provider = "fake"
    model = "fake-model"

    def __init__(self, deltas=(), error: VlmError | None = None, delay_s: float = 0.0):
        self.deltas, self.error, self.delay_s = list(deltas), error, delay_s
        self.calls: list[tuple] = []

    async def stream(self, system, image_jpeg, text, max_tokens, temperature):
        self.calls.append((system, image_jpeg, text, max_tokens, temperature))
        for d in self.deltas:
            await asyncio.sleep(self.delay_s)
            yield d
        if self.error:
            raise self.error


class FakeTts:
    """Audio is b"mp3:" + text. `delays` maps text → seconds; `fail` maps text → error code."""

    def __init__(self, delays: dict[str, float] | None = None, fail: dict[str, str] | None = None):
        self.delays, self.fail = delays or {}, fail or {}
        self.started: list[str] = []
        self.finished: list[str] = []

    async def synth(self, text, lang):
        self.started.append(text)
        await asyncio.sleep(self.delays.get(text, 0))
        if text in self.fail:
            raise UpstreamError(self.fail[text])
        self.finished.append(text)
        return b"mp3:" + text.encode()
