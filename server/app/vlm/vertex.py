"""Gemini on Vertex AI via google-genai in Vertex mode, streaming.

Auth is Application Default Credentials: `gcloud auth application-default login` locally, the
service account on Cloud Run. No key file.
"""

import asyncio
from collections.abc import AsyncIterator

from google import genai
from google.genai import errors, types

from app.vlm.base import VlmError, code_for_status


class VertexVlm:
    provider = "vertex"

    def __init__(
        self,
        project: str,
        location: str,
        model: str,
        *,
        timeout_s: float = 15.0,
        reasoning_off: bool = True,
        client: genai.Client | None = None,
    ):
        self.model = model
        self.timeout_s = timeout_s
        self.reasoning_off = reasoning_off
        self.client = client or genai.Client(vertexai=True, project=project, location=location)

    def build_config(self, system: str, max_tokens: int, temperature: float):
        cfg = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        if self.reasoning_off:
            cfg.thinking_config = thinking_off(self.model)
        return cfg

    async def stream(
        self, system: str, image_jpeg: bytes, text: str, max_tokens: int, temperature: float
    ) -> AsyncIterator[str]:
        contents = [types.Part.from_bytes(data=image_jpeg, mime_type="image/jpeg"), text]
        config = self.build_config(system, max_tokens, temperature)
        try:
            async with asyncio.timeout(self.timeout_s):
                it = await self.client.aio.models.generate_content_stream(
                    model=self.model, contents=contents, config=config
                )
                async for chunk in it:
                    if chunk.text:
                        yield chunk.text
        except TimeoutError as e:
            raise VlmError("vlm_timeout") from e
        except errors.APIError as e:
            raise VlmError(code_for_status(e.code or 0), e.code) from e
        except VlmError:
            raise
        except Exception as e:  # auth/ADC and transport errors surface as assorted types
            raise VlmError("vlm_unreachable") from e


def thinking_off(model: str) -> types.ThinkingConfig:
    """Gemini 2.x turns thinking off with budget 0; Gemini 3 has levels, "minimal" is the lowest."""
    if "gemini-2" in model:
        return types.ThinkingConfig(thinking_budget=0)
    return types.ThinkingConfig(thinking_level="minimal")
