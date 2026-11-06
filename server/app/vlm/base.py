"""One interface for every hosted vision model (spec §6), so providers swap by config."""

from collections.abc import AsyncIterator
from typing import Protocol


class VlmError(Exception):
    """A provider failure mapped to a short code that is safe to log and send to the app."""

    def __init__(self, code: str, status: int | None = None):
        super().__init__(code)
        self.code = code
        self.status = status


def code_for_status(status: int) -> str:
    if status in (401, 403):
        return "vlm_auth"
    if status == 402:
        return "vlm_credits"
    if status == 429:
        return "vlm_rate_limited"
    if status in (400, 404, 422):
        return "vlm_bad_request"
    return "vlm_error"


class VlmClient(Protocol):
    provider: str
    model: str

    def stream(
        self,
        system: str,
        image_jpeg: bytes,
        text: str,
        max_tokens: int,
        temperature: float,
    ) -> AsyncIterator[str]:
        """Yield answer text deltas as they arrive. Raises VlmError."""
        ...
