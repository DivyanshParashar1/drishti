"""OpenRouter (OpenAI-compatible chat completions) with SSE streaming."""

import base64
import json
from collections.abc import AsyncIterator

import httpx

from app.vlm.base import VlmError, code_for_status

URL = "https://openrouter.ai/api/v1/chat/completions"


class OpenRouterVlm:
    provider = "openrouter"

    def __init__(
        self,
        client: httpx.AsyncClient,
        api_key: str,
        model: str,
        *,
        url: str = URL,
        timeout_s: float = 15.0,
        min_reasoning: bool = True,
    ):
        self.client = client
        self.api_key = api_key
        self.model = model
        self.url = url
        self.timeout_s = timeout_s
        self.min_reasoning = min_reasoning

    def build_body(
        self, system: str, image_jpeg: bytes, text: str, max_tokens: int, temperature: float
    ) -> dict:
        data_url = "data:image/jpeg;base64," + base64.b64encode(image_jpeg).decode()
        body = {
            "model": self.model,
            "stream": True,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_url, "detail": "low"}},
                        {"type": "text", "text": text},
                    ],
                },
            ],
        }
        if self.min_reasoning:
            # Thinking adds latency and eats into max_tokens. "minimal" rather than
            # {"enabled": false}: some models (gemini-3.5-flash-lite) reject turning it off.
            body["reasoning"] = {"effort": "minimal"}
        return body

    async def stream(
        self, system: str, image_jpeg: bytes, text: str, max_tokens: int, temperature: float
    ) -> AsyncIterator[str]:
        body = self.build_body(system, image_jpeg, text, max_tokens, temperature)
        headers = {"Authorization": f"Bearer {self.api_key}", "X-Title": "Drishti"}
        try:
            async with self.client.stream(
                "POST", self.url, json=body, headers=headers, timeout=self.timeout_s
            ) as r:
                if r.status_code != 200:
                    await r.aread()
                    raise VlmError(code_for_status(r.status_code), r.status_code)
                async for line in r.aiter_lines():
                    delta = _parse_line(line)
                    if delta:
                        yield delta
        except httpx.TimeoutException as e:
            raise VlmError("vlm_timeout") from e
        except httpx.HTTPError as e:
            raise VlmError("vlm_unreachable") from e


def _parse_line(line: str) -> str | None:
    """One SSE line → a text delta, or None. Comment lines (": OPENROUTER PROCESSING") are skipped."""
    if not line.startswith("data:"):
        return None
    payload = line[5:].strip()
    if payload == "[DONE]" or not payload:
        return None
    try:
        chunk = json.loads(payload)
    except json.JSONDecodeError:
        return None
    if err := chunk.get("error"):
        # Mid-stream failure: HTTP status is already 200, the code is in the payload.
        status = err.get("code") if isinstance(err.get("code"), int) else None
        raise VlmError(code_for_status(status) if status else "vlm_error", status)
    choices = chunk.get("choices") or []
    if not choices:
        return None
    return (choices[0].get("delta") or {}).get("content") or None
