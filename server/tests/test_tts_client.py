import asyncio
import json

import httpx
import pytest

from app.gnani.errors import UpstreamError
from app.gnani.tts import GnaniTts

URL = "https://tts.test/inference"
MP3 = b"ID3fake-mp3"


def make(handler, **kw) -> GnaniTts:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return GnaniTts(client, "k", URL, retry_backoff_s=0, **kw)


async def test_sends_key_voice_and_mp3_config():
    seen = {}

    def handler(req: httpx.Request):
        seen["key"] = req.headers["x-api-key-id"]
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, content=MP3)

    assert await make(handler).synth("Car left mein", "hi-en") == MP3
    assert seen["key"] == "k"
    b = seen["body"]
    assert (b["model"], b["voice"], b["language"]) == ("timbre-v2.5", "Poorvi", "hi-en")
    assert b["audio_config"]["container"] == "mp3"


async def test_digits_are_passed_through_unchanged():
    # Timbre normalises numbers itself when language is explicit.
    seen = {}

    def handler(req):
        seen["text"] = json.loads(req.content)["text"]
        return httpx.Response(200, content=MP3)

    await make(handler).synth("Bus 42 aa rahi hai", "hi")
    assert seen["text"] == "Bus 42 aa rahi hai"


@pytest.mark.parametrize("text", ["", "   ", "x" * 201])
async def test_rejects_empty_or_too_long(text):
    with pytest.raises(UpstreamError) as e:
        await make(lambda r: httpx.Response(200, content=MP3)).synth(text, "en")
    assert e.value.code == "bad_request"


async def test_retries_once_on_429():
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(429) if len(calls) == 1 else httpx.Response(200, content=MP3)

    assert await make(handler).synth("hi", "en") == MP3
    assert len(calls) == 2


async def test_gives_up_after_second_429():
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(429)

    with pytest.raises(UpstreamError) as e:
        await make(handler).synth("hi", "en")
    assert e.value.code == "rate_limited" and len(calls) == 2


@pytest.mark.parametrize(
    "status,code",
    [
        (401, "gnani_auth"),
        (403, "gnani_auth"),
        (402, "credits_exhausted"),
        (400, "bad_request"),
        (500, "upstream_error"),
    ],
)
async def test_error_mapping_without_retry(status, code):
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(status)

    with pytest.raises(UpstreamError) as e:
        await make(handler).synth("hi", "en")
    assert e.value.code == code and len(calls) == 1


async def test_timeout_and_unreachable():
    def timeout(req):
        raise httpx.ReadTimeout("slow")

    def down(req):
        raise httpx.ConnectError("down")

    for handler, code in ((timeout, "upstream_timeout"), (down, "upstream_unreachable")):
        with pytest.raises(UpstreamError) as e:
            await make(handler).synth("hi", "en")
        assert e.value.code == code


async def test_calls_are_serialised():
    active = 0
    peak = 0

    async def handler(req):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.01)
        active -= 1
        return httpx.Response(200, content=MP3)

    tts = make(handler, max_concurrency=1)
    await asyncio.gather(*(tts.synth(f"s{i}", "en") for i in range(4)))
    assert peak == 1
