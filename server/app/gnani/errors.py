"""Upstream failures mapped to short, stable codes the app can act on (and we can log)."""


class UpstreamError(Exception):
    def __init__(self, code: str, status: int | None = None):
        super().__init__(code)
        self.code = code
        self.status = status


def code_for_status(status: int) -> str:
    if status in (401, 403):
        return "gnani_auth"
    if status == 402:
        return "credits_exhausted"
    if status == 429:
        return "rate_limited"
    if status in (400, 422):
        return "bad_request"
    return "upstream_error"
