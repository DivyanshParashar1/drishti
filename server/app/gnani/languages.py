"""App language codes → Gnani Prisma (STT) and Timbre (TTS) settings.

Checked against docs.gnani.ai on 2026-11-06:
- Prisma v3.0 output styles: verbatim | transcribe | codemix | transliterate.
- Live check 2026-11-06: realtime streaming rejects a language list ("exactly one locale is
  required") although the docs allow 1–4, so every language sends a single locale.
- Live check: for Hindi/Hinglish speech, `transliterate` returns Latin text ("is ko rahul ke
  naam se save karo") while `codemix` returned Devanagari even for English words ("सेव").
  Latin output matches the romanised command phrasings and keeps names in Latin, so hi and
  hi-en use `transliterate`.
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
    "hi": SttConfig("hi-IN", "transliterate"),
    "hi-en": SttConfig("hi-IN", "transliterate"),
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
