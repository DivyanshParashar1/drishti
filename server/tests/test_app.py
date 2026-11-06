from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings


def test_app_factory_uses_given_settings():
    s = Settings(app_token="t", vlm_provider="vertex")
    app = create_app(s)
    assert app.state.settings.vlm_provider == "vertex"


def test_health_ok():
    client = TestClient(create_app(Settings()))
    assert client.get("/health").json() == {"ok": True}
