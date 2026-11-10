"""Parts 2 and 4 narration: Timbre v3.0, Yashraj, one WAV per line."""
import asyncio, sys
from pathlib import Path
sys.path.insert(0, "/Users/divyanshparashar/Desktop/learning/drishti/server")
import httpx
from app.settings import Settings
OUT = Path(sys.argv[1])
LINES = {
 "p2_1": "A white cane finds what's at your feet.",
 "p2_2": "But not the car pulling out on your left.",
 "p2_3": "Not the friend who just walked up.",
 "p2_4": "Not the notice on the wall.",
 "p2_5": "Drishti is the software for smart glasses, running today on any Android phone.",
 "p2_5n": "With Drishti, a phone hangs around your neck, its camera facing the world.",
 "p2_7a": "It's designed to run even on a five-thousand-rupee phone.",
 "p2_7b": "Light models do the work, not expensive hardware.",
 "p2_6": "It watches the road with you, and tells you what's there, in your own language.",
 "p4_1": "So how does Drishti work? It thinks on two clocks.",
 "p4_2a": "The fast path never leaves the phone.",
 "p4_2b": "On-device models spot cars, chairs and people, and recognise saved faces.",
 "p4_3a": "Alerts play instantly from clips we made in advance with Gnani Timbre.",
 "p4_3b": "So even offline, Drishti speaks in Gnani's voice.",
 "p4_4": "The slow path goes to the cloud. Gnani Prisma turns your question into text as you speak, and a vision model looks at the scene.",
 "p4_5": "Then Timbre speaks the answer back, sentence by sentence, in about two seconds.",
 "p4_6": "Both paths share one voice, and a hazard always cuts in first.",
 "p4_7a": "Saved names are spoken once by Timbre and kept on the phone.",
 "p4_7b": "If the internet drops, Drishti says so, and the alerts keep running.",
 "p4_8": "No photos are stored, nothing you say is logged, and Drishti works alongside a cane, never instead of one.",
 "p4_9": "Oh, and this voice you've been hearing? <pauses> That's Gnani Timbre too.",
}
only = set(sys.argv[2:])
async def one(c, s, k, t):
    r = await c.post(s.gnani_tts_url, headers={"X-API-Key-ID": s.gnani_api_key}, json={
        "text": t, "voice": "Yashraj", "model": "timbre-v3.0", "language": "en-IN",
        "audio_config": {"sample_rate": 24000, "num_channels": 1, "container": "wav"}})
    if r.status_code != 200: raise SystemExit(f"{k}: {r.status_code} {r.text[:300]}")
    (OUT / f"{k}.wav").write_bytes(r.content); print(k, len(r.content))
async def main():
    s = Settings(); OUT.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=60) as c:
        for k, t in LINES.items():
            if not only or k in only: await one(c, s, k, t)
asyncio.run(main())
