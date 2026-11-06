import asyncio
import base64

from app.ask.image import jpeg_size
from app.ask.pipeline import AskInput, AskResult, run_ask
from app.ask.prompt import Detection
from app.vlm.base import VlmError
from tests.fakes_ask import FakeTts, FakeVlm, jpeg

INP = AskInput("Saamne kya hai?", "hi-en", jpeg(), [Detection(cls="car", dir="left")], ["Rahul"])


async def run(vlm, tts, inp=INP, result=None):
    return [e async for e in run_ask(vlm, tts, inp, result=result)]


def audio(event) -> bytes | None:
    b = event[1]["audio_b64"]
    return base64.b64decode(b) if b else None


async def test_sentences_in_order_when_second_audio_finishes_first():
    vlm = FakeVlm(["Car left mein hai. ", "Rahul aage ", "hai."])
    tts = FakeTts(delays={"Car left mein hai.": 0.05})
    events = await run(vlm, tts)

    assert tts.finished == ["Rahul aage hai.", "Car left mein hai."]  # 2 really did finish first
    assert [e[0] for e in events] == ["sentence", "sentence", "done"]
    assert [e[1]["index"] for e in events[:2]] == [0, 1]
    assert [e[1]["text"] for e in events[:2]] == ["Car left mein hai.", "Rahul aage hai."]
    assert audio(events[0]) == b"mp3:Car left mein hai."
    assert events[0][1]["mime"] == "audio/mpeg"


async def test_tts_starts_before_vlm_finishes():
    # Sentence 1's TTS must start while the model is still streaming sentence 2.
    vlm = FakeVlm(["Seedhe jao. ", "Aage ", "seedhi ", "hai."], delay_s=0.02)
    tts = FakeTts()
    gen = run_ask(vlm, tts, INP)
    first = await anext(gen)
    assert first[1]["text"] == "Seedhe jao."
    assert tts.started == ["Seedhe jao."]
    rest = [e async for e in gen]
    assert rest[-1][0] == "done"


async def test_done_carries_all_timings():
    events = await run(FakeVlm(["Ek. ", "Do."]), FakeTts())
    timings = events[-1][1]["timings"]
    assert set(timings) == {"vlm_first_token_ms", "first_sentence_ms", "first_audio_ms", "total_ms"}
    assert (
        timings["vlm_first_token_ms"]
        <= timings["first_sentence_ms"]
        <= timings["first_audio_ms"]
        <= timings["total_ms"]
    )


async def test_vlm_gets_prompt_image_and_context():
    vlm = FakeVlm(["Theek hai."])
    await run(vlm, FakeTts())
    system, image, text, max_tokens, temperature = vlm.calls[0]
    assert "Hinglish" in system
    assert image == INP.image_jpeg
    assert "car (left)" in text and "Rahul" in text
    assert (max_tokens, temperature) == (80, 0.2)


async def test_vlm_error_before_any_text():
    events = await run(FakeVlm(error=VlmError("vlm_rate_limited")), FakeTts())
    assert events == [("error", {"code": "vlm_rate_limited", "timings": events[0][1]["timings"]})]


async def test_vlm_error_mid_answer_keeps_finished_sentences():
    vlm = FakeVlm(["Car left. ", "Aur"], error=VlmError("vlm_timeout"))
    events = await run(vlm, FakeTts())
    assert [e[0] for e in events] == ["sentence", "error"]
    assert events[1][1]["code"] == "vlm_timeout"


async def test_unexpected_vlm_exception_is_internal():
    class Boom(FakeVlm):
        async def stream(self, *a):
            raise RuntimeError("bug")
            yield  # pragma: no cover

    events = await run(Boom(), FakeTts())
    assert events[-1] == ("error", {"code": "internal", "timings": events[-1][1]["timings"]})


async def test_tts_failure_sends_text_without_audio_and_continues():
    tts = FakeTts(fail={"Ek.": "rate_limited"})
    events = await run(FakeVlm(["Ek. Do."]), tts)
    assert events[0][1] == {
        "index": 0,
        "text": "Ek.",
        "audio_b64": None,
        "mime": None,
        "tts_error": "rate_limited",
    }
    assert audio(events[1]) == b"mp3:Do."
    assert events[2][0] == "done"


async def test_empty_answer_is_an_error():
    events = await run(FakeVlm(["  ", "\n"]), FakeTts())
    assert events[-1][0] == "error"
    assert events[-1][1]["code"] == "empty_answer"


async def test_result_tracks_outcome():
    result = AskResult()
    await run(FakeVlm(["Ek. Do."]), FakeTts(), result=result)
    assert (result.code, result.count) == ("ok", 2)


async def test_closing_early_cancels_pending_tts():
    vlm = FakeVlm(["Ek. Do. Teen."])
    tts = FakeTts(delays={"Do.": 0.05, "Teen.": 0.05})
    result = AskResult()
    gen = run_ask(vlm, tts, INP, result=result)
    await anext(gen)
    await gen.aclose()  # client went away
    await asyncio.sleep(0.15)  # long enough for the pending TTS calls to finish if not cancelled
    assert result.code == "client_gone"
    assert tts.finished == ["Ek."]


def test_jpeg_size():
    assert jpeg_size(jpeg(512, 384)) == (512, 384)
    assert jpeg_size(jpeg(640, 480)) == (640, 480)
    assert jpeg_size(b"\x89PNG\r\n") is None
    assert jpeg_size(b"\xff\xd8\xff\xda\x00\x08") is None
    assert jpeg_size(b"\xff\xd8") is None
