import pytest

from app.gnani.languages import LANGS, STT, TTS, parse_lang


def test_every_lang_has_stt_and_tts():
    for lang in LANGS:
        assert lang in STT and lang in TTS


def test_hinglish_uses_codemix_and_the_v25_hinglish_voice():
    assert STT["hi-en"].format == "codemix"
    assert STT["hi-en"].language_code == "hi-IN,en-IN"
    assert TTS["hi-en"].model == "timbre-v2.5" and TTS["hi-en"].language == "hi-en"


def test_parse_lang():
    assert parse_lang("ta") == "ta"
    for bad in (None, "", "hi-IN", "fr"):
        with pytest.raises(ValueError):
            parse_lang(bad)
