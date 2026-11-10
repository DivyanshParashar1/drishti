import json
import sys
from pathlib import Path

import pytest

from app.ask.image import jpeg_size
from app.ask.prompt import Detection
from app.gnani.languages import LANGS

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER / "scripts"))
import bench_vlm

CASES = json.loads((SERVER / "bench" / "cases.json").read_text())


def test_bench_set_size_and_languages():
    assert 5 <= len(CASES) <= 10
    langs = {c["lang"] for c in CASES}
    assert langs <= set(LANGS) and {"hi", "hi-en", "en", "ta"} <= langs  # P17 languages: not benched yet
    assert len({c["id"] for c in CASES}) == len(CASES)


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_case_is_valid_for_ask(case):
    data = (SERVER / "bench" / case["image"]).read_bytes()
    size = jpeg_size(data)
    assert size is not None and max(size) <= 512
    assert len(data) <= 300_000
    assert case["question"].strip()
    [Detection(**d) for d in case["detections"]]
    assert case["id"] in (SERVER / "bench" / "CREDITS.md").read_text()


def test_p95_nearest_rank():
    assert bench_vlm.p95([5, 1, 3]) == 5
    assert bench_vlm.p95(list(range(1, 101))) == 95


def test_summarise_ignores_failed_calls():
    rows = [
        {"model": "a", "code": "ok", "ttft_ms": 100, "first_sentence_ms": 300, "total_ms": 500},
        {"model": "a", "code": "ok", "ttft_ms": 200, "first_sentence_ms": 400, "total_ms": 700},
        {
            "model": "a",
            "code": "vlm_timeout",
            "ttft_ms": None,
            "first_sentence_ms": None,
            "total_ms": 9,
        },
        {
            "model": "b",
            "code": "vlm_auth",
            "ttft_ms": None,
            "first_sentence_ms": None,
            "total_ms": 1,
        },
    ]
    a, b = bench_vlm.summarise(rows)
    assert a == {
        "model": "a",
        "ok": "2/3",
        "ttft_p50": 150,
        "ttft_p95": 200,
        "first_sentence_p50": 350,
        "first_sentence_p95": 400,
        "total_p50": 600,
        "total_p95": 700,
    }
    assert b["ok"] == "0/1" and b["ttft_p50"] is None
