import pytest
from fastapi import WebSocket
from starlette.testclient import WebSocketDenialResponse

from app.auth import extract_bearer, token_ok
from tests.conftest import AUTH, TOKEN


@pytest.mark.parametrize(
    "header,expected",
    [
        (None, None),
        ("", None),
        ("Bearer", None),
        ("Bearer   ", None),
        ("Basic abc", None),
        ("Bearer abc", "abc"),
        ("bearer abc ", "abc"),
    ],
)
def test_extract_bearer(header, expected):
    assert extract_bearer(header) == expected


def test_token_ok_rejects_empty_expected():
    # A server started without APP_TOKEN must not accept an empty token.
    assert not token_ok("", "")
    assert not token_ok(None, "x")
    assert token_ok("x", "x")


def test_health_requires_token(client):
    assert client.get("/health").status_code == 401
    r = client.get("/health", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"


def test_health_with_token(client):
    r = client.get("/health", headers=AUTH)
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_unknown_route_still_needs_token(client):
    # Auth runs before routing reveals anything.
    assert client.get("/nope").status_code in (401, 404)


def test_no_docs_exposed(client):
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path, headers=AUTH).status_code == 404


def _add_ws_route(app):
    @app.websocket("/ws-test")
    async def ws_test(ws: WebSocket):
        await ws.accept()
        await ws.send_text("hello")
        await ws.close()


def test_websocket_rejects_missing_token(app, client):
    _add_ws_route(app)
    with pytest.raises(WebSocketDenialResponse) as e, client.websocket_connect("/ws-test"):
        pass
    assert e.value.status_code == 401


def test_websocket_rejects_wrong_token(app, client):
    _add_ws_route(app)
    with (
        pytest.raises(WebSocketDenialResponse) as e,
        client.websocket_connect("/ws-test", headers={"Authorization": "Bearer nope"}),
    ):
        pass
    assert e.value.status_code == 401


def test_websocket_accepts_token(app, client):
    _add_ws_route(app)
    with client.websocket_connect("/ws-test", headers={"Authorization": f"Bearer {TOKEN}"}) as ws:
        assert ws.receive_text() == "hello"
