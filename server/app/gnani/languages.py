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
- P17 (docs.gnani.ai "Supported languages" / "Available Voices", 2026-11-10): Prisma v2.5/v3.0
  and Timbre v3.0 both cover bn, en, gu, hi, kn, ml, mr, pa, ta, te; every v3.0 voice speaks all
  ten, so the seven added languages use Shivani like hi/en/ta, and STT returns native script
  (`verbatim`).
"""

from dataclasses import dataclass
from typing import Literal

Lang = Literal["hi", "hi-en", "en", "ta", "bn", "te", "kn", "ml", "mr", "gu", "pa"]
LANGS: tuple[Lang, ...] = ("hi", "hi-en", "en", "ta", "bn", "te", "kn", "ml", "mr", "gu", "pa")
# P17: languages added with only a locale; script output and voice as for Tamil.
_NATIVE: tuple[Lang, ...] = ("bn", "te", "kn", "ml", "mr", "gu", "pa")
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
    **{lang: SttConfig(f"{lang}-IN", "verbatim") for lang in _NATIVE},
}

# One v3.0 voice across hi/en/ta keeps the app's voice consistent; Hinglish needs v2.5.
TTS: dict[Lang, TtsConfig] = {
    "hi": TtsConfig("timbre-v3.0", "Shivani", "hi-IN"),
    "hi-en": TtsConfig("timbre-v2.5", "Poorvi", "hi-en"),
    "en": TtsConfig("timbre-v3.0", "Shivani", "en-IN"),
    "ta": TtsConfig("timbre-v3.0", "Shivani", "ta-IN"),
    **{lang: TtsConfig("timbre-v3.0", "Shivani", f"{lang}-IN") for lang in _NATIVE},
}


def parse_lang(value: str | None) -> Lang:
    if value in LANGS:
        return value  # type: ignore[return-value]
    raise ValueError(f"unsupported lang: {value!r}")
