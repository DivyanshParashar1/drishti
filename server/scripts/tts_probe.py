"""Speak one line through the running server's /tts and save the MP3.

uv run python scripts/tts_probe.py --lang hi-en "Car left mein, paas"
"""

import argparse
import time
from pathlib import Path

import httpx
from _common import auth_headers, server_url

ap = argparse.ArgumentParser()
ap.add_argument("text")
ap.add_argument("--lang", default="hi-en")
ap.add_argument("--out", default="tts_probe.mp3")
a = ap.parse_args()

t0 = time.perf_counter()
r = httpx.post(
    f"{server_url()}/tts", json={"text": a.text, "lang": a.lang}, headers=auth_headers(), timeout=20
)
ms = (time.perf_counter() - t0) * 1000
if r.status_code != 200:
    raise SystemExit(f"{r.status_code} {r.text} ({ms:.0f} ms)")
Path(a.out).write_bytes(r.content)
print(f"{a.lang}: {len(r.content)} bytes in {ms:.0f} ms -> {a.out}")
