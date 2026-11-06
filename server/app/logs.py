"""Privacy-safe logging (spec §9): timings and error codes only.

Never log transcripts, questions, images, audio, names, embeddings, headers or tokens.
`log_event` enforces this with an allow-list, so a new field has to be added here on purpose.
"""

import logging
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("drishti")


def configure_logging() -> None:
    """Our logger at INFO; silence third-party loggers that print full URLs or payloads."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    for noisy in ("httpx", "httpcore", "websockets", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


ALLOWED_FIELDS = frozenset(
    {"method", "path", "status", "kind", "code", "provider", "model", "lang", "bytes", "count"}
)


def _allowed(key: str) -> bool:
    return key in ALLOWED_FIELDS or key.endswith("_ms")


def log_event(event: str, level: int = logging.INFO, **fields: object) -> None:
    bad = [k for k in fields if not _allowed(k)]
    if bad:
        raise ValueError(f"log field(s) not on the privacy allow-list: {bad}")
    parts = " ".join(f"{k}={v}" for k, v in fields.items())
    logger.log(level, f"{event} {parts}".strip())


class AccessLogMiddleware:
    """Logs method, path (no query string), status and duration for HTTP and WebSocket."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        start = time.perf_counter()
        status: int | str = "-"

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            t = message["type"]
            if t == "http.response.start" or t == "websocket.http.response.start":
                status = message["status"]
            elif t == "websocket.accept":
                status = 101
            elif t == "websocket.close" and status == "-":
                status = 403  # closed before accept: the server's handshake rejection
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            status = 500
            raise
        finally:
            log_event(
                "ws" if scope["type"] == "websocket" else "http",
                method=scope.get("method", "WS"),
                path=scope["path"],
                status=status,
                duration_ms=round((time.perf_counter() - start) * 1000, 1),
            )
