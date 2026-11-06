from fastapi import Depends, FastAPI

from app.ratelimit import RateLimiter, enforce_rate_limit
from app.settings import Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="Drishti relay",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        dependencies=[Depends(enforce_rate_limit)],
    )
    app.state.settings = settings
    app.state.rate_limiter = RateLimiter(settings.rate_limit_per_min)

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    return app


app = create_app()
