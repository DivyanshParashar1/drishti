"""App language codes → Gnani Prisma (STT) and Timbre (TTS) settings.

Checked against docs.gnani.ai on 2026-11-06:
- Prisma v3.0 takes 1–4 comma-separated language hints and output styles
  verbatim | transcribe | codemix | transliterate.
- Timbre v3.0 voices speak 10 languages but not Hinglish; only Timbre v2.5 has a
  Hinglish voice (Poorvi, language "hi-en").
- Timbre normalises digits itself when `language` is explicit ("42" → "बयालीस"),
  so the server does not convert numbers to words.
"""

from dataclasses import dataclass
from typing import Literal

Lang = Literal["hi", "hi-en", "en", "ta"]
LANGS: tuple[Lang, ...] = ("hi", "hi-en", "en", "ta")
DEFAULT_LANG: Lang = "hi-en"


@dataclass(frozen=True)
class SttConfig:
    language_code: str
    format: str


@dataclass(frozen=True)
class TtsConfig:
    model: str
    voice: str
    language: str


STT: dict[Lang, SttConfig] = {
    "hi": SttConfig("hi-IN", "verbatim"),
    "hi-en": SttConfig("hi-IN,en-IN", "codemix"),
    "en": SttConfig("en-IN", "verbatim"),
    "ta": SttConfig("ta-IN", "verbatim"),
}

# One v3.0 voice across hi/en/ta keeps the app's voice consistent; Hinglish needs v2.5.
TTS: dict[Lang, TtsConfig] = {
    "hi": TtsConfig("timbre-v3.0", "Shivani", "hi-IN"),
    "hi-en": TtsConfig("timbre-v2.5", "Poorvi", "hi-en"),
    "en": TtsConfig("timbre-v3.0", "Shivani", "en-IN"),
    "ta": TtsConfig("timbre-v3.0", "Shivani", "ta-IN"),
}


def parse_lang(value: str | None) -> Lang:
    if value in LANGS:
        return value  # type: ignore[return-value]
    raise ValueError(f"unsupported lang: {value!r}")
