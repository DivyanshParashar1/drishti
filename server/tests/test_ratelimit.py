import pytest
from fastapi import WebSocket
from starlette.testclient import WebSocketDenialResponse

from app.ratelimit import RateLimiter
from tests.conftest import AUTH


class FakeClock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def test_allows_up_to_limit_then_blocks():
    rl = RateLimiter(3, FakeClock())
    assert [rl.check("a") for _ in range(3)] == [None, None, None]
    assert rl.check("a") == pytest.approx(60.0)


def test_window_slides():
    clock = FakeClock()
    rl = RateLimiter(2, clock)
    rl.check("a")
    clock.t += 30
    rl.check("a")
    clock.t += 29
    assert rl.check("a") == pytest.approx(1.0)  # first hit expires in 1 s
    clock.t += 1
    assert rl.check("a") is None


def test_tokens_are_independent():
    rl = RateLimiter(1, FakeClock())
    assert rl.check("a") is None
    assert rl.check("b") is None
    assert rl.check("a") is not None


def test_blocked_hits_do_not_extend_the_window():
    clock = FakeClock()
    rl = RateLimiter(1, clock)
    rl.check("a")
    for _ in range(10):
        clock.t += 5
        rl.check("a")
    clock.t = 1060.0
    assert rl.check("a") is None


def _add_routes(app):
    @app.get("/thing")
    async def thing():
        return {"ok": True}

    @app.websocket("/ws-thing")
    async def ws_thing(ws: WebSocket):
        await ws.accept()
        await ws.close()


def test_31st_request_in_a_minute_gets_429(app, client):
    _add_routes(app)
    for _ in range(30):
        assert client.get("/thing", headers=AUTH).status_code == 200
    r = client.get("/thing", headers=AUTH)
    assert r.status_code == 429
    assert 1 <= int(r.headers["retry-after"]) <= 60


def test_health_is_exempt(app, client):
    for _ in range(40):
        assert client.get("/health", headers=AUTH).status_code == 200


def test_unauthenticated_requests_are_not_counted(app, client):
    _add_routes(app)
    for _ in range(40):
        assert client.get("/thing").status_code == 401
    assert client.get("/thing", headers=AUTH).status_code == 200


def test_websocket_connects_count(app, client):
    _add_routes(app)
    for _ in range(30):
        with client.websocket_connect("/ws-thing", headers=AUTH):
            pass
    with (
        pytest.raises(WebSocketDenialResponse) as e,
        client.websocket_connect("/ws-thing", headers=AUTH),
    ):
        pass
    assert e.value.status_code == 429
