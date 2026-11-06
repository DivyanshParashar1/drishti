"""Build the configured VLM client from settings (VLM_PROVIDER + VLM_MODEL), no code change."""

import httpx

from app.settings import Settings
from app.vlm.base import VlmClient


def make_vlm(settings: Settings, http: httpx.AsyncClient) -> VlmClient:
    return make_vlm_for(settings.vlm_provider, settings.vlm_model, settings, http)


def make_vlm_for(
    provider: str, model: str, settings: Settings, http: httpx.AsyncClient
) -> VlmClient:
    if not model:
        raise ValueError("VLM_MODEL is not set")
    if provider == "openrouter":
        from app.vlm.openrouter import OpenRouterVlm

        return OpenRouterVlm(
            http,
            settings.openrouter_api_key,
            model,
            timeout_s=settings.vlm_timeout_s,
            reasoning_off=settings.vlm_reasoning_off,
        )
    if provider == "vertex":
        from app.vlm.vertex import VertexVlm

        return VertexVlm(
            settings.vertex_project,
            settings.vertex_location,
            model,
            timeout_s=settings.vlm_timeout_s,
            reasoning_off=settings.vlm_reasoning_off,
        )
    raise ValueError(f"unknown VLM provider: {provider!r}")
