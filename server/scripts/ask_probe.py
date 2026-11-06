"""Ask one question about a bench image through the running server's /ask; print each SSE event
with client-side arrival time and save the sentence audio as MP3s.

uv run python scripts/ask_probe.py --case stairs
uv run python scripts/ask_probe.py --image photo.jpg --lang en "What is ahead?"
"""

import argparse
import base64
import json
import time
from pathlib import Path

import httpx
from _common import SERVER_DIR, auth_headers, server_url

ap = argparse.ArgumentParser()
ap.add_argument("question", nargs="?")
ap.add_argument("--case", help="bench case id from bench/cases.json")
ap.add_argument("--image")
ap.add_argument("--lang", default="hi-en")
ap.add_argument("--out-dir", default=".")
a = ap.parse_args()

form = {"question": a.question, "lang": a.lang, "detections": "[]", "names": "[]"}
image = Path(a.image) if a.image else None
if a.case:
    case = next(
        c for c in json.loads((SERVER_DIR / "bench/cases.json").read_text()) if c["id"] == a.case
    )
    form |= {
        "question": a.question or case["question"],
        "lang": case["lang"],
        "detections": json.dumps(case["detections"]),
        "names": json.dumps(case["names"]),
    }
    image = SERVER_DIR / "bench" / case["image"]
if not image or not form["question"]:
    raise SystemExit("give --case, or --image and a question")

t0 = time.perf_counter()
files = {"image": (image.name, image.read_bytes(), "image/jpeg")}
with httpx.stream(
    "POST", f"{server_url()}/ask", data=form, files=files, headers=auth_headers(), timeout=30
) as r:
    if r.status_code != 200:
        r.read()
        raise SystemExit(f"{r.status_code} {r.text}")
    event = None
    for line in r.iter_lines():
        if line.startswith("event: "):
            event = line[7:]
        elif line.startswith("data: "):
            ms = (time.perf_counter() - t0) * 1000
            data = json.loads(line[6:])
            if event == "sentence":
                audio = data.pop("audio_b64")
                if audio:
                    out = Path(a.out_dir) / f"ask_probe_{data['index']}.mp3"
                    out.write_bytes(base64.b64decode(audio))
                    data["audio"] = f"{out} ({out.stat().st_size} bytes)"
            print(f"{ms:7.0f} ms  {event}: {json.dumps(data, ensure_ascii=False)}")
