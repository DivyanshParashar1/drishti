import json
from types import SimpleNamespace

import httpx
import pytest
from google.genai import errors

from app.settings import Settings
from app.vlm.base import VlmError
from app.vlm.factory import make_vlm, make_vlm_for
from app.vlm.openrouter import OpenRouterVlm
from app.vlm.vertex import VertexVlm, thinking_off

JPEG = b"\xff\xd8\xff\xe0fake"
ARGS = ("SYS", JPEG, "Question: hi", 80, 0.2)


def sse(*chunks: dict | str) -> bytes:
    lines = [": OPENROUTER PROCESSING", ""]
    for c in chunks:
        lines += [f"data: {c if isinstance(c, str) else json.dumps(c)}", ""]
    return "\n".join(lines).encode()


def delta(text: str) -> dict:
    return {"choices": [{"delta": {"content": text}}]}


def openrouter(handler) -> OpenRouterVlm:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return OpenRouterVlm(client, "or-key", "google/some-model")


async def collect(vlm) -> list[str]:
    return [d async for d in vlm.stream(*ARGS)]


# --- OpenRouter ---


async def test_openrouter_streams_deltas_and_sends_request():
    seen = {}

    def handler(req: httpx.Request):
        seen["auth"] = req.headers["authorization"]
        seen["body"] = json.loads(req.content)
        body = sse(delta("Car "), {"choices": [{"delta": {}}]}, delta("left."), "[DONE]")
        return httpx.Response(200, content=body)

    assert await collect(openrouter(handler)) == ["Car ", "left."]
    assert seen["auth"] == "Bearer or-key"
    b = seen["body"]
    assert (b["model"], b["stream"], b["max_tokens"], b["temperature"]) == (
        "google/some-model",
        True,
        80,
        0.2,
    )
    assert b["reasoning"] == {"enabled": False}
    assert b["messages"][0] == {"role": "system", "content": "SYS"}
    image, text = b["messages"][1]["content"]
    assert image["image_url"]["url"].startswith("data:image/jpeg;base64,/9j/")
    assert text == {"type": "text", "text": "Question: hi"}


@pytest.mark.parametrize(
    "status,code",
    [(401, "vlm_auth"), (402, "vlm_credits"), (429, "vlm_rate_limited"), (500, "vlm_error")],
)
async def test_openrouter_http_errors(status, code):
    with pytest.raises(VlmError) as e:
        await collect(openrouter(lambda r: httpx.Response(status, json={"error": {}})))
    assert e.value.code == code


async def test_openrouter_mid_stream_error():
    body = sse(delta("Car"), {"error": {"code": 502, "message": "provider down"}})
    vlm = openrouter(lambda r: httpx.Response(200, content=body))
    got = []
    with pytest.raises(VlmError) as e:
        async for d in vlm.stream(*ARGS):
            got.append(d)
    assert got == ["Car"]
    assert e.value.code == "vlm_error"


async def test_openrouter_timeout():
    def handler(req):
        raise httpx.ReadTimeout("slow")

    with pytest.raises(VlmError) as e:
        await collect(openrouter(handler))
    assert e.value.code == "vlm_timeout"


# --- Vertex ---


class FakeModels:
    def __init__(self, texts=(), error=None):
        self.texts, self.error, self.calls = texts, error, []

    async def generate_content_stream(self, *, model, contents, config):
        self.calls.append((model, contents, config))
        if self.error:
            raise self.error

        async def gen():
            for t in self.texts:
                yield SimpleNamespace(text=t)

        return gen()


def vertex(models: FakeModels, model="gemini-2.5-flash-lite") -> VertexVlm:
    client = SimpleNamespace(aio=SimpleNamespace(models=models))
    return VertexVlm("proj", "asia-south1", model, client=client)


async def test_vertex_streams_and_configures():
    models = FakeModels(["Seedhi ", None, "aage hai."])
    assert await collect(vertex(models)) == ["Seedhi ", "aage hai."]
    model, contents, cfg = models.calls[0]
    assert model == "gemini-2.5-flash-lite"
    assert contents[0].inline_data.data == JPEG
    assert contents[1] == "Question: hi"
    assert (cfg.system_instruction, cfg.max_output_tokens, cfg.temperature) == ("SYS", 80, 0.2)
    assert cfg.thinking_config.thinking_budget == 0


def test_thinking_off_per_generation():
    assert thinking_off("gemini-2.5-flash").thinking_budget == 0
    assert thinking_off("gemini-3-flash").thinking_level.value.lower() == "minimal"


@pytest.mark.parametrize("status,code", [(403, "vlm_auth"), (429, "vlm_rate_limited")])
async def test_vertex_api_errors(status, code):
    err = errors.APIError(status, {"error": {"message": "x"}})
    with pytest.raises(VlmError) as e:
        await collect(vertex(FakeModels(error=err)))
    assert e.value.code == code


async def test_vertex_other_errors_are_unreachable():
    with pytest.raises(VlmError) as e:
        await collect(vertex(FakeModels(error=RuntimeError("no ADC"))))
    assert e.value.code == "vlm_unreachable"


# --- factory ---


async def test_factory_picks_provider_from_config():
    async with httpx.AsyncClient() as http:
        s = Settings(vlm_provider="openrouter", vlm_model="m1")
        v = make_vlm(s, http)
        assert (v.provider, v.model) == ("openrouter", "m1")
        v = make_vlm(
            Settings(vlm_provider="vertex", vlm_model="gemini-x", vertex_project="p"), http
        )
        assert (v.provider, v.model) == ("vertex", "gemini-x")


async def test_factory_rejects_missing_model_or_provider():
    async with httpx.AsyncClient() as http:
        with pytest.raises(ValueError, match="VLM_MODEL"):
            make_vlm(Settings(vlm_model=""), http)
        with pytest.raises(ValueError, match="unknown"):
            make_vlm_for("groq", "m", Settings(), http)
