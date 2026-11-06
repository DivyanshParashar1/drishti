import logging

import pytest
from fastapi import Request, WebSocket

from app.logs import log_event
from tests.conftest import AUTH, TOKEN

SECRET_TEXT = "Rahul aapke saamne hai"


def test_log_event_rejects_fields_off_the_allow_list():
    for field in ("text", "transcript", "question", "image", "name", "token", "headers"):
        with pytest.raises(ValueError):
            log_event("x", **{field: "secret"})


def test_log_event_accepts_timings_and_codes(caplog):
    with caplog.at_level(logging.INFO, logger="drishti"):
        log_event("ask", provider="openrouter", code="ok", vlm_first_token_ms=412.0)
    assert "ask provider=openrouter code=ok vlm_first_token_ms=412.0" in caplog.text


def _add_routes(app):
    @app.post("/echo")
    async def echo(request: Request):
        return {"len": len(await request.body())}

    @app.websocket("/ws-echo")
    async def ws_echo(ws: WebSocket):
        await ws.accept()
        await ws.send_text(await ws.receive_text())
        await ws.close()


def test_access_log_has_no_body_query_or_token(app, client, caplog):
    _add_routes(app)
    with caplog.at_level(logging.DEBUG):
        client.post("/echo?q=" + SECRET_TEXT, content=SECRET_TEXT.encode(), headers=AUTH)
        with client.websocket_connect("/ws-echo", headers=AUTH) as ws:
            ws.send_text(SECRET_TEXT)
            ws.receive_text()
    assert "http method=POST path=/echo status=200" in caplog.text
    assert "ws method=WS path=/ws-echo status=101" in caplog.text
    assert SECRET_TEXT not in caplog.text
    assert "Rahul" not in caplog.text
    assert TOKEN not in caplog.text


def test_access_log_records_rejections(client, caplog):
    with caplog.at_level(logging.INFO, logger="drishti"):
        client.get("/health")
    assert "path=/health status=401" in caplog.text


def test_access_log_websocket_to_unknown_route(client, caplog):
    from starlette.websockets import WebSocketDisconnect

    with (
        caplog.at_level(logging.INFO, logger="drishti"),
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/nope", headers=AUTH),
    ):
        pass
    assert "path=/nope status=403" in caplog.text
