"""POST /ask: multipart question + frame in, SSE out (spec §7).

Events: `sentence` {index, text, audio_b64, mime, en[, tts_error]} in order (with `gloss`
{index, en} for an English line that came after its sentence), then `done` {timings}
or `error` {code, timings}. Request problems are rejected before the stream starts, with a
4xx/5xx and {"code": …}.
"""

import json
from typing import Annotated

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import Field, TypeAdapter, ValidationError

from app.ask.image import jpeg_size
from app.ask.pipeline import AskInput, AskResult, run_ask
from app.ask.prompt import Detection
from app.gnani.languages import Lang
from app.logs import log_event

router = APIRouter()

MAX_QUESTION = 500
_DETECTIONS = TypeAdapter(Annotated[list[Detection], Field(max_length=30)])
_NAMES = TypeAdapter(
    Annotated[list[Annotated[str, Field(min_length=1, max_length=40)]], Field(max_length=10)]
)


def _reject(code: str, status: int = 422) -> JSONResponse:
    log_event("ask", code=code)
    return JSONResponse({"code": code}, status_code=status)


@router.post("/ask")
async def ask(
    request: Request,
    question: Annotated[str, Form(min_length=1, max_length=MAX_QUESTION)],
    lang: Annotated[Lang, Form()],
    image: Annotated[UploadFile, File()],
    detections: Annotated[str, Form()] = "[]",
    names: Annotated[str, Form()] = "[]",
):
    settings = request.app.state.settings
    vlm = request.app.state.vlm
    if vlm is None:
        return _reject("vlm_not_configured", 503)
    if not question.strip():
        return _reject("bad_question")
    try:
        dets = _DETECTIONS.validate_python(json.loads(detections))
        name_list = _NAMES.validate_python(json.loads(names))
    except (json.JSONDecodeError, ValidationError):
        return _reject("bad_metadata")

    jpeg = await image.read(settings.ask_max_image_bytes + 1)
    if len(jpeg) > settings.ask_max_image_bytes:
        return _reject("image_too_large", 413)
    size = jpeg_size(jpeg)
    if size is None:
        return _reject("bad_image")
    if max(size) > settings.ask_max_image_px:
        return _reject("image_too_large", 413)

    inp = AskInput(question, lang, jpeg, dets, name_list)
    result = AskResult()

    async def events():
        try:
            async for name, data in run_ask(
                vlm,
                request.app.state.tts,
                inp,
                max_tokens=settings.vlm_max_tokens,
                temperature=settings.vlm_temperature,
                result=result,
            ):
                yield f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        finally:
            log_event(
                "ask",
                code=result.code,
                provider=vlm.provider,
                model=vlm.model,
                lang=lang,
                count=result.count,
                **result.timings,
            )

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
