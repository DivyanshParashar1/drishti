import os
from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_TOKEN = "dev-token"


class Settings(BaseSettings):
    """Server config from env vars (or server/.env locally). Secrets never live in the repo."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_token: str = DEV_TOKEN
    gnani_api_key: str = ""
    vlm_provider: Literal["openrouter", "vertex"] = "openrouter"
    vlm_model: str = ""
    openrouter_api_key: str = ""
    vertex_project: str = ""
    vertex_location: str = "asia-south1"
    rate_limit_per_min: int = 30

    gnani_tts_url: str = "https://api.vachana.ai/api/v1/tts/inference"
    gnani_stt_url: str = "wss://api.vachana.ai/stt/v3/stream"
    tts_timeout_s: float = 10.0
    tts_max_concurrency: int = 1  # some Gnani accounts allow one active request at a time
    tts_retry_backoff_s: float = 0.4
    stt_final_timeout_s: float = 3.0
    # Prisma tuning (2026-11-10), each switchable on Cloud Run by env var without a rebuild.
    stt_vad_threshold: float = 0.5  # 0 = don't send (Prisma default 0.7, tuned for telephony)
    stt_context: bool = True  # send command keyterms + topic

    vlm_timeout_s: float = 15.0
    vlm_min_reasoning: bool = True  # lowest thinking the model allows: it adds latency, eats tokens
    vlm_max_tokens: int = 80
    vlm_temperature: float = 0.2
    ask_max_image_bytes: int = 300_000
    ask_max_image_px: int = 512

    @model_validator(mode="after")
    def _no_dev_token_in_production(self) -> "Settings":
        # Cloud Run sets K_SERVICE. Refuse to start there with a missing or default token.
        if os.environ.get("K_SERVICE") and self.app_token in ("", DEV_TOKEN):
            raise ValueError("APP_TOKEN must be set to a real secret on Cloud Run")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
