"""Per-token sliding-window rate limit, in memory (spec §7: protects Gnani/VLM credits).

One Cloud Run instance is expected (min=1); with several instances each keeps its own window.
"""

import math
import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from starlette.requests import HTTPConnection

from app.auth import require_token

EXEMPT_PATHS = frozenset({"/health"})
WINDOW_S = 60.0


class RateLimiter:
    def __init__(self, limit_per_min: int, clock: Callable[[], float] = time.monotonic):
        self.limit = limit_per_min
        self.clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> float | None:
        """Record a hit. Returns None if allowed, else seconds until the next slot frees."""
        now = self.clock()
        hits = self._hits[key]
        while hits and now - hits[0] >= WINDOW_S:
            hits.popleft()
        if len(hits) >= self.limit:
            return WINDOW_S - (now - hits[0])
        hits.append(now)
        return None


async def enforce_rate_limit(conn: HTTPConnection, token: str = Depends(require_token)) -> None:
    if conn.url.path in EXEMPT_PATHS:
        return
    retry_after = conn.app.state.rate_limiter.check(token)
    if retry_after is not None:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="rate_limited",
            headers={"Retry-After": str(max(1, math.ceil(retry_after)))},
        )
