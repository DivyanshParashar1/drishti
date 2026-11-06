from app.main import create_app
from app.settings import Settings


def test_app_factory_uses_given_settings():
    app = create_app(Settings(app_token="t", vlm_provider="vertex"))
    assert app.state.settings.vlm_provider == "vertex"
