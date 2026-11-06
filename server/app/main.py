from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI

from app.gnani.stt import Connector, websockets_connector
from app.gnani.tts import GnaniTts
from app.logs import AccessLogMiddleware, configure_logging
from app.ratelimit import RateLimiter, enforce_rate_limit
from app.routes import ask, stt, tts
from app.settings import Settings, get_settings
from app.vlm.base import VlmClient
from app.vlm.factory import make_vlm


def create_app(
    settings: Settings | None = None,
    *,
    tts_client: GnaniTts | None = None,
    stt_connector: Connector | None = None,
    vlm_client: VlmClient | None = None,
) -> FastAPI:
    """Build the app. Tests inject fake upstream clients; otherwise real ones are made at startup."""
    configure_logging()
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with httpx.AsyncClient() as http:
            app.state.tts = tts_client or GnaniTts(
                http,
                settings.gnani_api_key,
                settings.gnani_tts_url,
                timeout_s=settings.tts_timeout_s,
                max_concurrency=settings.tts_max_concurrency,
                retry_backoff_s=settings.tts_retry_backoff_s,
            )
            # No model configured → /ask answers 503 vlm_not_configured; the rest still works.
            if vlm_client is None and settings.vlm_model:
                app.state.vlm = make_vlm(settings, http)
            yield

    app = FastAPI(
        title="Drishti relay",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        dependencies=[Depends(enforce_rate_limit)],
        lifespan=lifespan,
    )
    app.add_middleware(AccessLogMiddleware)
    app.state.settings = settings
    app.state.rate_limiter = RateLimiter(settings.rate_limit_per_min)
    app.state.stt_connector = stt_connector or websockets_connector
    app.state.vlm = vlm_client
    if tts_client is not None:
        app.state.tts = tts_client

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    app.include_router(tts.router)
    app.include_router(stt.router)
    app.include_router(ask.router)
    return app


app = create_app()
