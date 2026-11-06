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

    @model_validator(mode="after")
    def _no_dev_token_in_production(self) -> "Settings":
        # Cloud Run sets K_SERVICE. Refuse to start there with a missing or default token.
        if os.environ.get("K_SERVICE") and self.app_token in ("", DEV_TOKEN):
            raise ValueError("APP_TOKEN must be set to a real secret on Cloud Run")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
