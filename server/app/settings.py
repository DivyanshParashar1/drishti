from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Server config from env vars (or server/.env locally). Secrets never live in the repo."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_token: str = "dev-token"
    gnani_api_key: str = ""
    vlm_provider: Literal["openrouter", "vertex"] = "openrouter"
    vlm_model: str = ""
    openrouter_api_key: str = ""
    vertex_project: str = ""
    vertex_location: str = "asia-south1"
    rate_limit_per_min: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
