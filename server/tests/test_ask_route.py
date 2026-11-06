import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.vlm.base import VlmError
from tests.conftest import AUTH
from tests.fakes_ask import FakeTts, FakeVlm, jpeg

QUESTION = "Kya ye bus 42 hai?"


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.split("\n"))
        events.append((lines["event"], json.loads(lines["data"])))
    return events


def make_client(settings, vlm=None, tts=None) -> TestClient:
    vlm = vlm if vlm is not None else FakeVlm(["Haan, bus 42 hai. ", "Left mein khadi hai."])
    return TestClient(create_app(settings, tts_client=tts or FakeTts(), vlm_client=vlm))


def post(client, *, image=None, headers=AUTH, **form):
    data = {"question": QUESTION, "lang": "hi-en"} | form
    files = {"image": ("frame.jpg", image if image is not None else jpeg(), "image/jpeg")}
    return client.post("/ask", data=data, files=files, headers=headers)


def test_streams_sentences_then_done(settings):
    c = make_client(settings)
    r = post(
        c,
        detections=json.dumps([{"cls": "bus", "dir": "left", "dist": "far"}]),
        names=json.dumps(["Rahul"]),
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(r.text)
    assert [e[0] for e in events] == ["sentence", "sentence", "done"]
    assert events[0][1]["text"] == "Haan, bus 42 hai."
    assert events[1][1]["index"] == 1
    assert "total_ms" in events[2][1]["timings"]


def test_metadata_reaches_the_model(settings):
    vlm = FakeVlm(["Theek."])
    post(
        make_client(settings, vlm),
        detections=json.dumps([{"cls": "pole", "dir": "ahead", "dist": "2 steps"}]),
        names=json.dumps(["Asha"]),
        lang="ta",
    )
    system, _, text, _, _ = vlm.calls[0]
    assert "Tamil script" in system
    assert "pole (ahead, 2 steps)" in text and "Asha" in text and QUESTION in text


def test_detections_and_names_are_optional(settings):
    r = post(make_client(settings))
    assert parse_sse(r.text)[-1][0] == "done"


def test_vlm_error_is_an_sse_error_event(settings):
    c = make_client(settings, FakeVlm(error=VlmError("vlm_credits")))
    events = parse_sse(post(c).text)
    assert events[-1][0] == "error"
    assert events[-1][1]["code"] == "vlm_credits"


@pytest.mark.parametrize(
    "form,code",
    [
        ({"detections": "not json"}, "bad_metadata"),
        ({"detections": json.dumps([{"dir": "left"}])}, "bad_metadata"),
        ({"names": json.dumps(["x" * 41])}, "bad_metadata"),
        ({"names": json.dumps([f"n{i}" for i in range(11)])}, "bad_metadata"),
        ({"question": "   "}, "bad_question"),
    ],
)
def test_bad_metadata_rejected_before_streaming(settings, form, code):
    vlm = FakeVlm(["x."])
    r = post(make_client(settings, vlm), **form)
    assert r.status_code == 422
    assert r.json() == {"code": code}
    assert vlm.calls == []


@pytest.mark.parametrize("form", [{"lang": "fr"}, {"question": ""}, {"question": "x" * 501}])
def test_form_validation(settings, form):
    assert post(make_client(settings), **form).status_code == 422


def test_missing_image(settings):
    r = make_client(settings).post("/ask", data={"question": "hi", "lang": "en"}, headers=AUTH)
    assert r.status_code == 422


@pytest.mark.parametrize(
    "image,status,code",
    [
        (jpeg(640, 480), 413, "image_too_large"),
        (jpeg(384, 513), 413, "image_too_large"),
        (b"\x89PNG\r\n\x1a\nnot a jpeg", 422, "bad_image"),
        (jpeg() + b"\x00" * 300_000, 413, "image_too_large"),
    ],
)
def test_image_checks(settings, image, status, code):
    vlm = FakeVlm(["x."])
    r = post(make_client(settings, vlm), image=image)
    assert (r.status_code, r.json()) == (status, {"code": code})
    assert vlm.calls == []


def test_no_model_configured_is_503(settings):
    c = TestClient(create_app(settings, tts_client=FakeTts()))
    r = post(c)
    assert (r.status_code, r.json()) == (503, {"code": "vlm_not_configured"})


def test_requires_token(settings):
    assert post(make_client(settings), headers={}).status_code == 401


def test_logs_timings_not_content(settings, caplog):
    c = make_client(settings, FakeVlm(["Rahul aage hai."]))
    with caplog.at_level(logging.INFO, logger="drishti"):
        post(c, names=json.dumps(["Rahul"]))
    line = next(r.message for r in caplog.records if r.message.startswith("ask "))
    assert "code=ok provider=fake model=fake-model lang=hi-en count=1" in line
    assert "first_audio_ms=" in line and "total_ms=" in line
    assert "Rahul" not in caplog.text
    assert "bus 42" not in caplog.text


def test_real_vlm_client_built_from_config(settings):
    s = settings.model_copy(update={"vlm_provider": "openrouter", "vlm_model": "some/model"})
    with TestClient(create_app(s, tts_client=FakeTts())) as c:
        assert (c.app.state.vlm.provider, c.app.state.vlm.model) == ("openrouter", "some/model")
