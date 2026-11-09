import pytest

from app.ask.prompt import HAZARDS, Detection, system_prompt, user_text, wants_gloss
from app.gnani.languages import LANGS


@pytest.mark.parametrize("lang", LANGS)
def test_system_prompt_has_every_f6_rule(lang):
    p = system_prompt(lang)
    assert "at most 2 short sentences" in p
    assert "safety-relevant fact first" in p
    assert "left, ahead or right" in p
    assert HAZARDS in p
    assert "auto-rickshaws" in p
    assert "Never guess who a person is" in p
    assert "aren't sure, say so" in p


@pytest.mark.parametrize(
    "lang,marker",
    [("hi", "Devanagari"), ("hi-en", "Latin script"), ("en", "English"), ("ta", "Tamil script")],
)
def test_language_instruction(lang, marker):
    assert marker in system_prompt(lang).split("Language:")[1]


def test_language_prompts_differ():
    assert len({system_prompt(lang) for lang in LANGS}) == len(LANGS)


def test_user_text_with_detections_and_names():
    t = user_text(
        "  Saamne kya hai? ",
        [Detection(cls="car", dir="left", dist="near"), Detection(cls="chair")],
        ["Rahul"],
    )
    assert t == (
        "Question: Saamne kya hai?\n"
        "On-device detections (may be incomplete): car (left, near); chair\n"
        "Recognised people in view: Rahul"
    )


def test_user_text_says_no_names():
    t = user_text("Who is this?", [], [])
    assert "detections" not in t
    assert t.endswith("Recognised people in view: none")


@pytest.mark.parametrize("lang", ["hi", "hi-en", "ta"])
def test_gloss_rule_outside_english(lang):
    assert wants_gloss(lang)
    assert "curly braces" in system_prompt(lang)


def test_no_gloss_in_english():
    assert not wants_gloss("en")
    assert "curly braces" not in system_prompt("en")
