import json
import re
import sys
import wave
from pathlib import Path

import pytest

from app.gnani.errors import UpstreamError
from app.gnani.languages import LANGS

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER / "scripts"))
import gen_clips

PHRASES = gen_clips.load_phrases()
# P17: every YOLO11n (COCO-80) class is announced, so each needs a phrase.
F1_CLASSES = [c.replace(" ", "_") for c in ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"]]
DEVANAGARI = re.compile(r"[ऀ-ॿ]")
TAMIL = re.compile(r"[஀-௿]")


# --- phrases.json ---


def test_every_key_has_every_language():
    for key, texts in PHRASES.items():
        assert set(texts) == set(LANGS), key
        for lang in LANGS:
            assert texts[lang].strip(), (key, lang)
            assert len(texts[lang]) <= 200, (key, lang)


def test_keys_follow_category_value():
    for key in PHRASES:
        assert re.fullmatch(r"(obj|dir|dist|sys)\.[a-z0-9_]+", key), key


def test_covers_f1_alert_classes_directions_and_distances():
    assert {k for k in PHRASES if k.startswith("obj.")} == {f"obj.{c}" for c in F1_CLASSES}
    assert {k for k in PHRASES if k.startswith("dir.")} == {"dir.left", "dir.ahead", "dir.right"}
    assert {k for k in PHRASES if k.startswith("dist.")} == {"dist.near", "dist.far"}


def test_spec_system_lines_present():
    for key in (
        "sys.unknown_person",
        "sys.no_internet",
        "sys.internet_lost",
        "sys.camera_blocked",
        "sys.cane",
        "sys.welcome",
        "sys.ask_name",
        "sys.consent",
        "sys.no_text",
        "sys.lang_switched",
    ):
        assert key in PHRASES
    assert PHRASES["sys.unknown_person"]["hi-en"] == "Koi anjaan vyakti saamne hai"
    assert (
        PHRASES["sys.cane"]["hi-en"]
        == "Drishti aapki cane ke saath kaam karta hai, uski jagah nahi."
    )


def test_scripts_match_language():
    for key, t in PHRASES.items():
        assert not DEVANAGARI.search(t["hi-en"]) and not TAMIL.search(t["hi-en"]), key
        assert t["en"].isascii(), key
        assert DEVANAGARI.search(t["hi"]), key
        assert TAMIL.search(t["ta"]), key


# --- build_lang against a fake TTS ---


class FakeTts:
    def __init__(self, fail: dict[str, str] | None = None):
        self.calls: list[tuple[str, str]] = []
        self.fail = fail or {}

    async def synth(self, text, lang):
        self.calls.append((text, lang))
        if text in self.fail:
            raise UpstreamError(self.fail[text])
        return b"ID3" + text.encode()


SMALL = {
    "obj.car": {"hi-en": "Car", "hi": "कार", "en": "Car", "ta": "கார்"},
    "dir.left": {"hi-en": "left mein", "hi": "बाएँ", "en": "on the left", "ta": "இடது பக்கம்"},
}


async def test_builds_pack_and_manifest(tmp_path):
    tts = FakeTts()
    r = await gen_clips.build_lang(tts, SMALL, "hi-en", tmp_path, force=False)
    assert sorted(r["made"]) == ["dir.left", "obj.car"]
    assert (tmp_path / "hi-en" / "obj.car.mp3").read_bytes() == b"ID3Car"
    m = json.loads((tmp_path / "hi-en" / "manifest.json").read_text())
    assert m["lang"] == "hi-en" and m["voice"] == "timbre-v2.5/Poorvi"
    assert m["clips"]["obj.car"] == {"file": "obj.car.mp3", "text": "Car", "en": "Car", "bytes": 6}


async def test_rerun_is_idempotent_and_only_redoes_changed_text(tmp_path):
    await gen_clips.build_lang(FakeTts(), SMALL, "hi-en", tmp_path, force=False)
    tts = FakeTts()
    assert (await gen_clips.build_lang(tts, SMALL, "hi-en", tmp_path, force=False))["made"] == []
    assert tts.calls == []

    changed = SMALL | {"obj.car": SMALL["obj.car"] | {"hi-en": "Gaadi"}}
    r = await gen_clips.build_lang(tts, changed, "hi-en", tmp_path, force=False)
    assert r["made"] == ["obj.car"] and tts.calls == [("Gaadi", "hi-en")]


async def test_missing_file_is_regenerated_and_force_redoes_all(tmp_path):
    await gen_clips.build_lang(FakeTts(), SMALL, "en", tmp_path, force=False)
    (tmp_path / "en" / "dir.left.mp3").unlink()
    assert (await gen_clips.build_lang(FakeTts(), SMALL, "en", tmp_path, False))["made"] == [
        "dir.left"
    ]
    assert len((await gen_clips.build_lang(FakeTts(), SMALL, "en", tmp_path, True))["made"]) == 2


async def test_removed_keys_are_deleted(tmp_path):
    await gen_clips.build_lang(FakeTts(), SMALL, "ta", tmp_path, force=False)
    only_car = {"obj.car": SMALL["obj.car"]}
    r = await gen_clips.build_lang(FakeTts(), only_car, "ta", tmp_path, force=False)
    assert r["removed"] == ["dir.left"]
    assert not (tmp_path / "ta" / "dir.left.mp3").exists()
    assert list(json.loads((tmp_path / "ta" / "manifest.json").read_text())["clips"]) == ["obj.car"]


async def test_failure_skips_clip_and_credits_exhausted_stops(tmp_path):
    r = await gen_clips.build_lang(FakeTts({"Car": "rate_limited"}), SMALL, "en", tmp_path, False)
    assert r["failed"] == {"obj.car": "rate_limited"} and r["made"] == ["dir.left"]

    tts = FakeTts({"कार": "credits_exhausted"})
    r = await gen_clips.build_lang(tts, SMALL, "hi", tmp_path, False)
    assert r["failed"] == {"obj.car": "credits_exhausted"} and r["made"] == []
    assert len(tts.calls) == 1  # stopped; dir.left not attempted


async def test_typescript_map(tmp_path):
    clips, ts = tmp_path / "app/assets/clips", tmp_path / "app/src/audio/clips.generated.ts"
    await gen_clips.build_lang(FakeTts(), SMALL, "hi-en", clips, force=False)
    gen_clips.write_ts(SMALL, clips, ts)
    out = ts.read_text()
    assert (
        '"obj.car": { text: "Car", en: "Car", asset: require("../../assets/clips/hi-en/obj.car.mp3") }'
        in out
    )
    assert '"obj.car": { text: "कार", en: "Car", asset: null }' in out  # hi pack not generated
    assert 'listen_start: require("../../assets/clips/earcons/listen_start.wav")' in out


def test_earcons_are_valid_wavs(tmp_path):
    names = gen_clips.write_earcons(tmp_path)
    assert names == ["error", "listen_start", "listen_stop"]
    for n in names:
        with wave.open(str(tmp_path / "earcons" / f"{n}.wav")) as w:
            assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, 24000)
            assert 0.1 < w.getnframes() / 24000 < 0.4


# --- the committed packs ---


@pytest.mark.parametrize("lang", LANGS)
def test_committed_manifest_entries_have_files(lang):
    d = gen_clips.CLIPS_DIR / lang
    if not (d / "manifest.json").exists():
        pytest.skip(f"{lang} pack not generated yet")
    for key, entry in gen_clips.load_manifest(d)["clips"].items():
        assert key in PHRASES, key
        f = d / entry["file"]
        assert f.exists() and f.stat().st_size == entry["bytes"], key


def test_committed_typescript_is_up_to_date():
    if not gen_clips.TS_PATH.exists():
        pytest.skip("clips.generated.ts not written yet")
    expected = gen_clips.render_ts(PHRASES, gen_clips.CLIPS_DIR, gen_clips.TS_PATH)
    assert gen_clips.TS_PATH.read_text() == expected, "rerun scripts/gen_clips.py"
