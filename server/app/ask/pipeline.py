"""The /ask pipeline (spec §7): stream the VLM, split into sentences, start Timbre for each
sentence the moment it completes, and emit sentence events strictly in order.

A producer task reads the VLM stream and queues (sentence, tts_task) pairs. The consumer awaits
the TTS tasks in queue order, so sentence 2's audio can finish first without overtaking
sentence 1. If one sentence's TTS fails, its event carries the text with no audio (the app falls
back to Android TTS, D12) and the answer continues.
"""

import asyncio
import base64
import time
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field

from app.ask.prompt import Detection, system_prompt, user_text
from app.ask.splitter import SentenceSplitter
from app.gnani.errors import UpstreamError
from app.gnani.languages import Lang
from app.vlm.base import VlmClient, VlmError

Event = tuple[str, dict]
_END = object()


@dataclass
class AskInput:
    question: str
    lang: Lang
    image_jpeg: bytes
    detections: list[Detection] = field(default_factory=list)
    names: list[str] = field(default_factory=list)


@dataclass
class AskResult:
    """Filled in as the pipeline runs, so the caller can log it even if the stream is cut."""

    code: str = "client_gone"
    count: int = 0
    timings: dict[str, float] = field(default_factory=dict)


async def run_ask(
    vlm: VlmClient,
    tts,
    inp: AskInput,
    *,
    max_tokens: int = 80,
    temperature: float = 0.2,
    result: AskResult | None = None,
    clock: Callable[[], float] = time.perf_counter,
) -> AsyncIterator[Event]:
    result = result or AskResult()
    t = result.timings
    start = clock()

    def mark(key: str) -> None:
        t.setdefault(key, round((clock() - start) * 1000, 1))

    queue: asyncio.Queue = asyncio.Queue()

    def submit(sentence: str) -> None:
        mark("first_sentence_ms")
        queue.put_nowait((sentence, asyncio.create_task(tts.synth(sentence, inp.lang))))

    async def produce() -> None:
        splitter = SentenceSplitter()
        try:
            async for delta in vlm.stream(
                system_prompt(inp.lang),
                inp.image_jpeg,
                user_text(inp.question, inp.detections, inp.names),
                max_tokens,
                temperature,
            ):
                mark("vlm_first_token_ms")
                for s in splitter.feed(delta):
                    submit(s)
            for s in splitter.flush():
                submit(s)
            queue.put_nowait(_END)
        except VlmError as e:
            queue.put_nowait(e)
        except Exception:  # noqa: BLE001 — a bug must end the stream with an error event
            queue.put_nowait(VlmError("internal"))

    producer = asyncio.create_task(produce())
    started: list[asyncio.Task] = []
    error: str | None = None
    try:
        while True:
            item = await queue.get()
            if item is _END:
                break
            if isinstance(item, VlmError):
                error = item.code
                break
            text, task = item
            started.append(task)
            event = {"index": result.count, "text": text, "audio_b64": None, "mime": None}
            try:
                audio = await task
                event["audio_b64"] = base64.b64encode(audio).decode()
                event["mime"] = "audio/mpeg"
                mark("first_audio_ms")
            except UpstreamError as e:
                event["tts_error"] = e.code
            result.count += 1
            yield "sentence", event

        if error is None and result.count == 0:
            error = "empty_answer"
        mark("total_ms")
        if error:
            result.code = error
            yield "error", {"code": error, "timings": dict(t)}
        else:
            result.code = "ok"
            yield "done", {"timings": dict(t)}
    finally:
        producer.cancel()
        while not queue.empty():
            item = queue.get_nowait()
            if isinstance(item, tuple):
                started.append(item[1])
        for task in started:
            task.cancel()
