"""Bearer-token auth for every route, HTTP and WebSocket (spec §7).

Applied app-wide as a dependency. For WebSockets, Starlette turns the 401 into an
HTTP denial response during the handshake, so the client sees 401 before any upgrade.
"""

import hmac

from fastapi import HTTPException, status
from starlette.requests import HTTPConnection


def extract_bearer(header: str | None) -> str | None:
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def token_ok(presented: str | None, expected: str) -> bool:
    if presented is None or not expected:
        return False
    return hmac.compare_digest(presented.encode(), expected.encode())


async def require_token(conn: HTTPConnection) -> str:
    token = extract_bearer(conn.headers.get("authorization"))
    if not token_ok(token, conn.app.state.settings.app_token):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token  # type: ignore[return-value]
