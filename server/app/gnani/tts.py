"""Timbre text-to-speech over REST (POST /api/v1/tts/inference), returning MP3 bytes."""

import asyncio

import httpx

from app.gnani.errors import UpstreamError, code_for_status
from app.gnani.languages import TTS, Lang

MAX_CHARS = 200  # long text can 500 with no stated limit; callers chunk to <= 200
AUDIO_CONFIG = {"sample_rate": 24000, "num_channels": 1, "container": "mp3", "bitrate": "64k"}


class GnaniTts:
    def __init__(
        self,
        client: httpx.AsyncClient,
        api_key: str,
        url: str,
        timeout_s: float = 10.0,
        max_concurrency: int = 1,
        retry_backoff_s: float = 0.4,
    ):
        self.client = client
        self.api_key = api_key
        self.url = url
        self.timeout_s = timeout_s
        self.retry_backoff_s = retry_backoff_s
        self._sem = asyncio.Semaphore(max_concurrency)

    def build_body(self, text: str, lang: Lang) -> dict:
        cfg = TTS[lang]
        return {
            "text": text,
            "voice": cfg.voice,
            "model": cfg.model,
            "language": cfg.language,
            "speed": 1.0,
            "audio_config": AUDIO_CONFIG,
        }

    async def synth(self, text: str, lang: Lang) -> bytes:
        text = text.strip()
        if not text or len(text) > MAX_CHARS:
            raise UpstreamError("bad_request")
        body = self.build_body(text, lang)
        for attempt in (0, 1):
            async with self._sem:
                try:
                    r = await self.client.post(
                        self.url,
                        json=body,
                        headers={"X-API-Key-ID": self.api_key},
                        timeout=self.timeout_s,
                    )
                except httpx.TimeoutException as e:
                    raise UpstreamError("upstream_timeout") from e
                except httpx.HTTPError as e:
                    raise UpstreamError("upstream_unreachable") from e
            if r.status_code == 200 and r.content:
                return r.content
            if r.status_code == 429 and attempt == 0:
                await asyncio.sleep(self.retry_backoff_s)
                continue
            raise UpstreamError(code_for_status(r.status_code), r.status_code)
        raise AssertionError("unreachable")
