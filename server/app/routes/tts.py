import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from app.gnani.errors import UpstreamError
from app.gnani.languages import Lang
from app.gnani.tts import MAX_CHARS
from app.logs import log_event

router = APIRouter()

# Upstream error code → HTTP status returned to the app.
STATUS_FOR_CODE = {
    "bad_request": 400,
    "rate_limited": 429,
    "credits_exhausted": 503,
    "gnani_auth": 502,
    "upstream_error": 502,
    "upstream_unreachable": 502,
    "upstream_timeout": 504,
}


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHARS)
    lang: Lang


@router.post("/tts")
async def tts(req: TtsRequest, request: Request) -> Response:
    start = time.perf_counter()
    try:
        audio = await request.app.state.tts.synth(req.text, req.lang)
    except UpstreamError as e:
        log_event("tts", code=e.code, lang=req.lang, total_ms=_ms(start))
        return JSONResponse({"code": e.code}, status_code=STATUS_FOR_CODE.get(e.code, 502))
    log_event("tts", code="ok", lang=req.lang, bytes=len(audio), total_ms=_ms(start))
    return Response(audio, media_type="audio/mpeg")


def _ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 1)
