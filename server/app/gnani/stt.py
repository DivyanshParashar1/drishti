"""Prisma realtime STT relay: one app push-to-talk hold → one upstream session → one final transcript.

Protocol to Prisma (docs.gnani.ai, checked 2026-11-06): config in upgrade headers, exact 1,024-byte
PCM frames, JSON events `connected | speech_start | processing | transcript | error`, and a
`{"type":"commit"}` frame that closes the open utterance without waiting for silence.
"""

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass, field
from typing import Protocol

import websockets
from websockets.exceptions import InvalidStatus

from app.gnani.errors import UpstreamError, code_for_status
from app.gnani.framing import PcmFramer
from app.gnani.languages import STT, STT_KEYTERMS, STT_TOPIC, Lang

SAMPLE_RATE = 16000
COMMIT_GRACE_S = 0.15  # wait this long after commit for a late speech_start before giving up


class UpstreamConn(Protocol):
    async def send(self, data: bytes | str) -> None: ...
    def __aiter__(self) -> AsyncIterator[str | bytes]: ...


Connector = Callable[[str, dict[str, str]], AbstractAsyncContextManager[UpstreamConn]]


def build_headers(
    api_key: str,
    lang: Lang,
    *,
    vad_threshold: float | None = None,
    context: bool = False,
) -> dict[str, str]:
    """Upgrade headers for one session. The keyword options default to the plain 2026-11-06
    config; the /stt route passes the tuned values from Settings."""
    cfg = STT[lang]
    headers = {
        "x-api-key-id": api_key,
        "model": "prisma-v3.0",
        "language_code": cfg.language_code,
        "format": cfg.format,
        "x-sample-rate": str(SAMPLE_RATE),
        "x-idle-timeout-sec": "30",
        # Holds are short and we commit on release, so a longer silence window just avoids
        # splitting a question at a natural pause; it doesn't add latency at the end.
        "x-min-silence-ms": "800",
    }
    if vad_threshold:
        # Default 0.7 is Gnani's telephony value; a phone held close is a "clean mic" (0.45–0.55).
        # Too high and Prisma opens the segment late, clipping the first word.
        headers["x-vad-threshold"] = f"{vad_threshold:g}"
    if context:
        if terms := STT_KEYTERMS.get(lang):
            headers["keyterms"] = json.dumps(terms)  # ASCII-escaped, as headers require
        headers["topic"] = STT_TOPIC
    return headers


@asynccontextmanager
async def websockets_connector(url: str, headers: dict[str, str]):
    try:
        async with websockets.connect(
            url, additional_headers=headers, open_timeout=5, close_timeout=1
        ) as ws:
            yield ws
    except InvalidStatus as e:
        raise UpstreamError(code_for_status(e.response.status_code), e.response.status_code) from e
    except (OSError, TimeoutError) as e:
        raise UpstreamError("upstream_unreachable") from e


@dataclass
class TranscriptState:
    segments: list[str] = field(default_factory=list)
    detected: str | None = None
    speech_starts: int = 0
    processing: int = 0
    fatal: str | None = None
    changed: asyncio.Event = field(default_factory=asyncio.Event)

    @property
    def pending(self) -> int:
        """Utterances the server has seen start but not yet transcribed."""
        return max(self.speech_starts, self.processing) - len(self.segments)

    def apply(self, msg: dict) -> None:
        kind = msg.get("type")
        if kind == "speech_start":
            self.speech_starts += 1
        elif kind == "processing":
            self.processing += 1
        elif kind == "transcript":
            text = (msg.get("text") or "").strip()
            self.segments.append(text)
            self.detected = msg.get("detected_language_code") or self.detected
        self.changed.set()

    @property
    def text(self) -> str:
        return " ".join(s for s in self.segments if s)


class SttSession:
    """Drives one upstream session. Call push() with PCM, then finish() for the final text."""

    def __init__(self, conn: UpstreamConn, final_timeout_s: float = 3.0):
        self.conn = conn
        self.final_timeout_s = final_timeout_s
        self.framer = PcmFramer()
        self.state = TranscriptState()
        self._reader = asyncio.create_task(self._read())
        self._error_seen = False

    async def _read(self) -> None:
        try:
            async for raw in self.conn:
                if isinstance(raw, bytes):
                    continue
                try:
                    msg = json.loads(raw)
                except ValueError:
                    continue
                if msg.get("type") == "error":
                    self._error_seen = True
                self.state.apply(msg)
        except websockets.ConnectionClosed:
            pass
        finally:
            # An upstream `error` followed by a close is fatal (bad header, session cap, 15-min
            # limit). An `error` on a single utterance leaves the session open and is ignored.
            if self._error_seen:
                self.state.fatal = "stt_error"
            self.state.changed.set()

    @property
    def upstream_closed(self) -> bool:
        return self._reader.done()

    async def push(self, chunk: bytes) -> None:
        for frame in self.framer.push(chunk):
            await self.conn.send(frame)

    async def finish(self) -> TranscriptState:
        tail = self.framer.flush()
        if not self.upstream_closed:
            if tail is not None:
                await self.conn.send(tail)
            await self.conn.send(json.dumps({"type": "commit"}))
        try:
            await asyncio.wait_for(self._wait_settled(), self.final_timeout_s)
        except TimeoutError:
            pass  # return whatever segments arrived
        return self.state

    async def _wait_settled(self) -> None:
        loop = asyncio.get_running_loop()
        grace_until = loop.time() + COMMIT_GRACE_S
        while True:
            if self.upstream_closed:
                return
            if self.state.pending <= 0 and loop.time() >= grace_until:
                return
            self.state.changed.clear()
            timeout = max(0.0, grace_until - loop.time()) if self.state.pending <= 0 else None
            try:
                await asyncio.wait_for(self.state.changed.wait(), timeout)
            except TimeoutError:
                pass

    async def close(self) -> None:
        self._reader.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._reader
