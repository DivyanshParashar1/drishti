"""Compare VLM models on the fixed bench set (server/bench/cases.json).

    uv run python scripts/bench_vlm.py openrouter:google/gemini-2.5-flash-lite vertex:gemini-2.5-flash
    uv run python scripts/bench_vlm.py --runs 3 --cases sign,stairs openrouter:<model>

Calls the providers directly with the real /ask prompt (no server, no Timbre, so no Gnani
credits). Per model, it times: first token (TTFT), first complete sentence, and total. One warm-up
call per model is made first and not counted. Writes bench/results/<stamp>.csv (one row per call,
with the answer text so quality can be compared too) and prints median and p95 per model.
"""

import argparse
import asyncio
import csv
import json
import math
import statistics
import sys
import time
from datetime import datetime

import httpx
from _common import SERVER_DIR

from app.ask.prompt import Detection, system_prompt, user_text
from app.ask.splitter import SentenceSplitter
from app.settings import Settings
from app.vlm.base import VlmError
from app.vlm.factory import make_vlm_for

BENCH_DIR = SERVER_DIR / "bench"
FIELDS = [
    "model",
    "case",
    "lang",
    "run",
    "code",
    "ttft_ms",
    "first_sentence_ms",
    "total_ms",
    "answer",
]


def p95(values: list[float]) -> float:
    """Nearest-rank 95th percentile (with < 20 samples this is the max)."""
    s = sorted(values)
    return s[max(0, math.ceil(0.95 * len(s)) - 1)]


def summarise(rows: list[dict]) -> list[dict]:
    out = []
    for model in dict.fromkeys(r["model"] for r in rows):
        mine = [r for r in rows if r["model"] == model]
        ok = [r for r in mine if r["code"] == "ok"]
        row = {"model": model, "ok": f"{len(ok)}/{len(mine)}"}
        for key in ("ttft_ms", "first_sentence_ms", "total_ms"):
            vals = [r[key] for r in ok if r[key] is not None]
            row[f"{key[:-3]}_p50"] = round(statistics.median(vals)) if vals else None
            row[f"{key[:-3]}_p95"] = round(p95(vals)) if vals else None
        out.append(row)
    return out


async def time_one(vlm, case: dict, settings) -> dict:
    image = (BENCH_DIR / case["image"]).read_bytes()
    dets = [Detection(**d) for d in case["detections"]]
    splitter, parts = SentenceSplitter(), []
    ttft = first_sentence = None
    start = time.perf_counter()

    def ms() -> float:
        return round((time.perf_counter() - start) * 1000, 1)

    code = "ok"
    try:
        async for delta in vlm.stream(
            system_prompt(case["lang"]),
            image,
            user_text(case["question"], dets, case["names"]),
            settings.vlm_max_tokens,
            settings.vlm_temperature,
        ):
            ttft = ttft or ms()
            parts.append(delta)
            if splitter.feed(delta) and first_sentence is None:
                first_sentence = ms()
        if splitter.flush() and first_sentence is None:
            first_sentence = ms()
    except VlmError as e:
        code = e.code
    answer = "".join(parts).strip()
    if code == "ok" and not answer:
        code = "empty_answer"
    return {
        "ttft_ms": ttft,
        "first_sentence_ms": first_sentence,
        "total_ms": ms(),
        "code": code,
        "answer": answer,
    }


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument(
        "models", nargs="+", help="provider:model, e.g. openrouter:google/gemini-2.5-flash"
    )
    ap.add_argument("--runs", type=int, default=1, help="calls per case per model (default 1)")
    ap.add_argument("--cases", help="comma-separated case ids (default: all)")
    ap.add_argument("--no-warmup", action="store_true")
    args = ap.parse_args()

    settings = Settings()
    cases = json.loads((BENCH_DIR / "cases.json").read_text())
    if args.cases:
        wanted = set(args.cases.split(","))
        cases = [c for c in cases if c["id"] in wanted]
    rows: list[dict] = []
    async with httpx.AsyncClient() as http:
        for spec in args.models:
            provider, _, model = spec.partition(":")
            vlm = make_vlm_for(provider, model, settings, http)
            if not args.no_warmup:
                await time_one(vlm, cases[0], settings)
            for run in range(args.runs):
                for case in cases:
                    r = await time_one(vlm, case, settings)
                    rows.append(
                        {"model": spec, "case": case["id"], "lang": case["lang"], "run": run, **r}
                    )
                    print(
                        f"{spec:45} {case['id']:11} {r['code']:14} ttft={r['ttft_ms']} "
                        f"first={r['first_sentence_ms']} total={r['total_ms']}  {r['answer'][:70]!r}"
                    )

    out_dir = BENCH_DIR / "results"
    out_dir.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = out_dir / f"{stamp}.csv"
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    summary = summarise(rows)
    with (out_dir / f"{stamp}-summary.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(summary[0]))
        w.writeheader()
        w.writerows(summary)

    print(
        f"\n{'model':45} {'ok':>5} {'ttft p50/p95':>14} {'first p50/p95':>14} {'total p50/p95':>14}"
    )
    for s in summary:
        print(
            f"{s['model']:45} {s['ok']:>5} {s['ttft_p50']}/{s['ttft_p95']:>9} "
            f"{s['first_sentence_p50']}/{s['first_sentence_p95']:>9} {s['total_p50']}/{s['total_p95']:>9}"
        )
    print(f"\nwrote {path.relative_to(SERVER_DIR)}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
