"""Build STT test clips: Timbre speaks each sentence in tests/fixtures/stt/sentences.json as
16 kHz mono WAV, padded with 0.3 s of silence before and 0.5 s after. Spends TTS credits once;
skips clips that already exist. Real recorded voices can replace these later.

    uv run python scripts/make_stt_fixtures.py
"""

import asyncio
import io
import json
import wave

import httpx
from _common import SERVER_DIR

from app.gnani.tts import GnaniTts
from app.settings import Settings

FIX = SERVER_DIR / "tests" / "fixtures" / "stt"
WAV_16K = {
    "sample_rate": 16000,
    "num_channels": 1,
    "sample_width": 2,
    "encoding": "linear_pcm",
    "container": "wav",
}


def pad(wav_bytes: bytes) -> bytes:
    with wave.open(io.BytesIO(wav_bytes)) as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1
        pcm = w.readframes(w.getnframes())
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(bytes(int(16000 * 0.3) * 2) + pcm + bytes(int(16000 * 0.5) * 2))
    return out.getvalue()


async def main() -> None:
    s = Settings()
    sentences = json.loads((FIX / "sentences.json").read_text())
    async with httpx.AsyncClient() as http:
        tts = GnaniTts(http, s.gnani_api_key, s.gnani_tts_url, timeout_s=20)
        for name, item in sentences.items():
            path = FIX / f"{name}.wav"
            if path.exists():
                print("skip", name)
                continue
            audio = await tts.synth(item["text"], item["lang"], audio_config=WAV_16K)
            path.write_bytes(pad(audio))
            print("wrote", path.name)


asyncio.run(main())
