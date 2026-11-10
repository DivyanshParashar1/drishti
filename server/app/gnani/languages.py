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


# Prisma v3.0 context (docs.gnani.ai "Prisma v3.0 → Context", 2026-11-10): keyterms favour the
# app's command phrasings so one misheard word doesn't push a command to the VLM as a question
# (the router matches exact phrases). With `transliterate`, context must be in Latin letters.
# Gnani reports keyterms never hurt accuracy in their tests, and unspoken terms aren't inserted.
STT_TOPIC = (
    "A blind person giving short voice commands to a phone assistant called Drishti that sees "
    "through the camera: what is in front, read this sign, who is this, save or delete a person "
    "by name, repeat, stop, quiet mode, switch language."
)
_HINGLISH_TERMS = [
    "Drishti", "saamne kya hai", "aage kya hai", "kya dikh raha hai", "ye padho", "padho",
    "kya likha hai", "kaun hai", "ye kaun hai", "kaun kaun saved hai", "ke naam se save karo",
    "isko", "save karo", "delete karo", "hatao", "ruko", "band karo", "bas", "aage", "agla",
    "phir se bolo", "dobara bolo", "madad", "quiet mode", "shaant", "kam bolo", "sab batao",
    "demo mode", "mein bolo", "Hinglish", "Hindi", "English", "Tamil", "haan", "nahi",
    "theek hai", "raazi",
]
_ENGLISH_TERMS = [
    "Drishti", "what is ahead", "what is in front", "what do you see", "describe", "read this",
    "what does it say", "who is this", "who is here", "who is saved", "save this as",
    "delete", "forget", "stop", "next", "repeat", "say that again", "help", "quiet mode",
    "demo mode", "speak in Hindi", "speak in Hinglish", "speak in Tamil", "yes", "no",
]
_TAMIL_TERMS = [
    "த்ருஷ்டி", "முன்னால் என்ன இருக்கிறது", "என்ன தெரிகிறது", "இதைப் படி", "இது யார்",
    "சேமி", "நீக்கு", "நிறுத்து", "அடுத்து", "மீண்டும் சொல்", "உதவி", "அமைதி", "ஆம்", "இல்லை",
]
STT_KEYTERMS: dict[Lang, list[str]] = {
    "hi": _HINGLISH_TERMS,
    "hi-en": _HINGLISH_TERMS + _ENGLISH_TERMS[1:],
    "en": _ENGLISH_TERMS,
    "ta": _TAMIL_TERMS,
}


def parse_lang(value: str | None) -> Lang:
    if value in LANGS:
        return value  # type: ignore[return-value]
    raise ValueError(f"unsupported lang: {value!r}")
