from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI

from app.gnani.stt import Connector, websockets_connector
from app.gnani.tts import GnaniTts
from app.logs import AccessLogMiddleware, configure_logging
from app.ratelimit import RateLimiter, enforce_rate_limit
from app.routes import stt, tts
from app.settings import Settings, get_settings


def create_app(
    settings: Settings | None = None,
    *,
    tts_client: GnaniTts | None = None,
    stt_connector: Connector | None = None,
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
    if tts_client is not None:
        app.state.tts = tts_client

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    app.include_router(tts.router)
    app.include_router(stt.router)
    return app


app = create_app()
