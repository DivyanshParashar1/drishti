"""System prompt and user text for scene questions (spec F6; P17: plain answers, no steps).

The rules are written in English (models follow English instructions most reliably) and each
language adds an explicit instruction for the answer's language, script and wording. Numbers may
stay as digits: Timbre normalises them itself (P2 finding), and words would cost extra tokens.
"""

from pydantic import BaseModel, Field

from app.gnani.languages import Lang

RULES = """You are Drishti, the eyes of a blind person. They point a camera ahead and ask you about the scene.

Rules:
- Answer the question simply, in 1 or 2 short sentences. Your answer is read aloud.
- Say only what was asked. Don't add step-by-step directions, distances or step counts.
- You may say where something is as left, ahead or right.
- Never guess who a person is. Use only the names listed under "Recognised people". Describe anyone else without naming them.
- If you can't see clearly or aren't sure, say so briefly. Don't invent details.
- No lists, markdown or emoji."""

LANGUAGE_RULES: dict[Lang, str] = {
    "hi": (
        "Answer in Hindi, written in Devanagari script. Say directions as बाएँ, आगे, दाएँ."
    ),
    "hi-en": (
        "Answer in Hinglish: everyday Hindi mixed with common English words, written in Latin "
        "script only (no Devanagari). Say directions as left, aage, right."
    ),
    "en": "Answer in simple Indian English.",
    "ta": (
        "Answer in Tamil, written in Tamil script. Say directions as இடது, முன்னால், வலது."
    ),
}


class Detection(BaseModel):
    """One on-device detection, as the app reports it."""

    cls: str = Field(min_length=1, max_length=40)
    dir: str = Field(default="", max_length=20)
    dist: str = Field(default="", max_length=20)


# F12: the demo UI shows an English line under each spoken sentence. The gloss goes in braces
# right after its sentence; the pipeline strips it before TTS, so it's never read aloud.
GLOSS_RULE = (
    "After each sentence, write its English translation in curly braces, for example: "
    "<sentence> {<English translation>}. The braces are shown on screen, not read aloud; "
    "keep them out of the 2-sentence limit."
)

# Extra tokens for the glosses, so they don't eat into the answer's own budget.
GLOSS_TOKENS = 50


def wants_gloss(lang: Lang) -> bool:
    return lang != "en"


def system_prompt(lang: Lang) -> str:
    p = f"{RULES}\n\nLanguage: {LANGUAGE_RULES[lang]}"
    return f"{p}\n\n{GLOSS_RULE}" if wants_gloss(lang) else p


def user_text(question: str, detections: list[Detection], names: list[str]) -> str:
    """The text part sent alongside the image."""
    lines = [f"Question: {question.strip()}"]
    if detections:
        items = []
        for d in detections:
            where = ", ".join(x for x in (d.dir, d.dist) if x)
            items.append(f"{d.cls} ({where})" if where else d.cls)
        lines.append("On-device detections (may be incomplete): " + "; ".join(items))
    if names:
        lines.append("Recognised people in view: " + ", ".join(names))
    else:
        lines.append("Recognised people in view: none")
    return "\n".join(lines)
