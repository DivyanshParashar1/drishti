"""The /ask pipeline (spec §7): stream the VLM, split into sentences, start Timbre for each
sentence the moment it completes, and emit sentence events strictly in order.

A producer task reads the VLM stream and queues (sentence, tts_task, gloss) items. The consumer awaits
the TTS tasks in queue order, so sentence 2's audio can finish first without overtaking
sentence 1. If one sentence's TTS fails, its event carries the text with no audio (the app falls
back to Android TTS, D12) and the answer continues.

F12: outside English, each sentence is followed by its English gloss in braces. The gloss never
goes to TTS and never delays a sentence: it rides on the sentence event as `en` if it has
arrived by the time the audio is ready, else a `gloss` {index, en} event follows as soon as it
does (before the next sentence event at the latest).
"""

import asyncio
import base64
import time
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field

from app.ask.prompt import GLOSS_TOKENS, Detection, system_prompt, user_text, wants_gloss
from app.ask.splitter import GlossSplitter
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
    loop = asyncio.get_running_loop()
    last_gloss: list[asyncio.Future] = []  # the newest sentence's gloss, while it can still come

    def submit(sentence: str) -> None:
        mark("first_sentence_ms")
        gloss = loop.create_future()
        last_gloss[:] = [gloss]
        queue.put_nowait((sentence, asyncio.create_task(tts.synth(sentence, inp.lang)), gloss))

    def take(items: list[tuple[str, str]]) -> None:
        for kind, text in items:
            if kind == "sentence":
                submit(text)
            elif last_gloss and not last_gloss[0].done():
                last_gloss[0].set_result(text)

    async def produce() -> None:
        splitter = GlossSplitter()
        budget = max_tokens + (GLOSS_TOKENS if wants_gloss(inp.lang) else 0)
        try:
            async for delta in vlm.stream(
                system_prompt(inp.lang),
                inp.image_jpeg,
                user_text(inp.question, inp.detections, inp.names),
                budget,
                temperature,
            ):
                mark("vlm_first_token_ms")
                take(splitter.feed(delta))
            take(splitter.flush())
            queue.put_nowait(_END)
        except VlmError as e:
            queue.put_nowait(e)
        except Exception:  # noqa: BLE001 — a bug must end the stream with an error event
            queue.put_nowait(VlmError("internal"))

    producer = asyncio.create_task(produce())
    started: list[asyncio.Task] = []
    error: str | None = None
    waiting: list[tuple[int, asyncio.Future]] = []  # sent sentences whose gloss hadn't arrived

    def arrived() -> list[Event]:
        ready = [(i, f) for i, f in waiting if f.done()]
        waiting[:] = [w for w in waiting if not w[1].done()]
        return [("gloss", {"index": i, "en": f.result()}) for i, f in ready if f.result()]

    try:
        while True:
            item = await queue.get()
            for e in arrived():
                yield e
            if item is _END:
                break
            if isinstance(item, VlmError):
                error = item.code
                break
            text, task, gloss = item
            started.append(task)
            event = {
                "index": result.count,
                "text": text,
                "audio_b64": None,
                "mime": None,
                "en": None,
            }
            try:
                audio = await task
                event["audio_b64"] = base64.b64encode(audio).decode()
                event["mime"] = "audio/mpeg"
                mark("first_audio_ms")
            except UpstreamError as e:
                event["tts_error"] = e.code
            if gloss.done():
                event["en"] = gloss.result()
            else:
                waiting.append((result.count, gloss))
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
                item[2].cancel()
        for task in started:
            task.cancel()
