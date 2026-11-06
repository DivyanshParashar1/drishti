"""System prompt and user text for scene questions (spec F6).

The rules are written in English (models follow English instructions most reliably) and each
language adds an explicit instruction for the answer's language, script and wording. Numbers may
stay as digits: Timbre normalises them itself (P2 finding), and words would cost extra tokens.
"""

from pydantic import BaseModel, Field

from app.gnani.languages import Lang

HAZARDS = (
    "stairs, steps, kerbs, drops, poles, potholes, open drains, wet floors, and vehicles "
    "including auto-rickshaws"
)

RULES = f"""You are Drishti, the eyes of a blind person. They point a camera ahead and ask you about the scene.

Rules:
- Answer in at most 2 short sentences. Speak plainly; your answer is read aloud.
- Put the most safety-relevant fact first.
- Give positions as left, ahead or right, and rough distance in steps.
- Always check for {HAZARDS}. Mention any you see, with direction and distance, even if the question didn't ask.
- Never guess who a person is. Use only the names listed under "Recognised people". Describe anyone else without naming them.
- If you can't see clearly or aren't sure, say so briefly. Don't invent details.
- No lists, markdown or emoji."""

LANGUAGE_RULES: dict[Lang, str] = {
    "hi": (
        "Answer in Hindi, written in Devanagari script. "
        'Say directions as बाएँ, आगे, दाएँ and distances like "दो-तीन कदम आगे".'
    ),
    "hi-en": (
        "Answer in Hinglish: everyday Hindi mixed with common English words, written in Latin "
        "script only (no Devanagari). Say directions as left, aage, right and distances like "
        '"2-3 kadam aage".'
    ),
    "en": ('Answer in simple Indian English. Say distances like "2 to 3 steps ahead".'),
    "ta": (
        "Answer in Tamil, written in Tamil script. "
        'Say directions as இடது, முன்னால், வலது and distances like "இரண்டு மூன்று அடி முன்னால்".'
    ),
}


class Detection(BaseModel):
    """One on-device detection, as the app reports it."""

    cls: str = Field(min_length=1, max_length=40)
    dir: str = Field(default="", max_length=20)
    dist: str = Field(default="", max_length=20)


def system_prompt(lang: Lang) -> str:
    return f"{RULES}\n\nLanguage: {LANGUAGE_RULES[lang]}"


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
