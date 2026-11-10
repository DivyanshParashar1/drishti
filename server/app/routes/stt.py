"""WebSocket /stt — the app's push-to-talk stream.

Client → server: one JSON text frame {"lang": "hi-en"}, then binary 16 kHz 16-bit mono PCM
chunks (any size), then {"type": "end"} on button release.
Server → client: {"type": "final", "text": "...", "lang": "...", "detected": "hi-IN"|null},
or {"type": "error", "code": "..."}; then the server closes.
"""

import asyncio
import json
import time

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.gnani.errors import UpstreamError
from app.gnani.languages import parse_lang
from app.gnani.stt import SttSession, build_headers
from app.logs import log_event

router = APIRouter()

START_TIMEOUT_S = 5.0
MAX_HOLD_S = 30.0  # a stuck button must not keep a paid session open


@router.websocket("/stt")
async def stt(ws: WebSocket) -> None:
    await ws.accept()
    settings = ws.app.state.settings
    started = time.perf_counter()
    lang = None
    try:
        first = await asyncio.wait_for(ws.receive_text(), START_TIMEOUT_S)
        lang = parse_lang(json.loads(first).get("lang"))
    except (TimeoutError, ValueError, AttributeError, KeyError, WebSocketDisconnect):
        await _fail(ws, "bad_request", lang, started)
        return

    try:
        async with ws.app.state.stt_connector(
            settings.gnani_stt_url,
            build_headers(
                settings.gnani_api_key,
                lang,
                vad_threshold=settings.stt_vad_threshold,
                context=settings.stt_context,
            ),
        ) as conn:
            session = SttSession(conn, settings.stt_final_timeout_s)
            try:
                ended = await _pump_client(ws, session)
                if not ended:
                    log_event("stt", code="client_gone", lang=lang, total_ms=_ms(started))
                    return
                released = time.perf_counter()
                state = await session.finish()
                # Reply before leaving this block: closing the upstream socket waits for its
                # close handshake (up to ~1 s), which must not delay the user's transcript.
                await _deliver(ws, state, lang, started, released)
            finally:
                await session.close()
    except UpstreamError as e:
        await _fail(ws, e.code, lang, started)
    except websockets.ConnectionClosed:
        await _fail(ws, "stt_error", lang, started)


async def _deliver(ws: WebSocket, state, lang: str, started: float, released: float) -> None:
    if state.fatal and not state.segments:
        await _fail(ws, state.fatal, lang, started)
        return
    await ws.send_json(
        {"type": "final", "text": state.text, "lang": lang, "detected": state.detected}
    )
    log_event(
        "stt",
        code="ok",
        lang=lang,
        count=len(state.segments),
        final_ms=_ms(released),
        total_ms=_ms(started),
    )
    await ws.close()


async def _pump_client(ws: WebSocket, session: SttSession) -> bool:
    """Forward PCM until the client sends end (True) or disconnects (False)."""
    deadline = time.perf_counter() + MAX_HOLD_S
    while True:
        remaining = deadline - time.perf_counter()
        if remaining <= 0:
            return True  # treat a too-long hold as a release
        try:
            msg = await asyncio.wait_for(ws.receive(), remaining)
        except TimeoutError:
            return True
        if msg["type"] == "websocket.disconnect":
            return False
        if msg.get("bytes"):
            await session.push(msg["bytes"])
        elif msg.get("text"):
            try:
                if json.loads(msg["text"]).get("type") == "end":
                    return True
            except (ValueError, AttributeError):
                pass


async def _fail(ws: WebSocket, code: str, lang: str | None, started: float) -> None:
    log_event("stt", code=code, lang=lang or "-", total_ms=_ms(started))
    try:
        await ws.send_json({"type": "error", "code": code})
        await ws.close()
    except (RuntimeError, WebSocketDisconnect):
        pass


def _ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 1)
