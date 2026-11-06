from app.main import create_app
from app.settings import Settings


def test_app_factory_uses_given_settings():
    app = create_app(Settings(app_token="t", vlm_provider="vertex"))
    assert app.state.settings.vlm_provider == "vertex"


def test_refuses_dev_token_on_cloud_run(monkeypatch):
    import pytest

    monkeypatch.setenv("K_SERVICE", "drishti-relay")
    for token in ("", "dev-token"):
        with pytest.raises(ValueError, match="APP_TOKEN"):
            Settings(app_token=token)
    assert Settings(app_token="a-real-secret").app_token == "a-real-secret"


def test_dev_token_allowed_locally(monkeypatch):
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.delenv("APP_TOKEN", raising=False)
    assert Settings(_env_file=None).app_token == "dev-token"
