"""Streaming sentence splitter for VLM output (spec §7: split on . ? ! ।).

`feed()` takes text deltas as they stream in and returns every sentence that is now complete,
so the caller can start TTS for sentence 1 while the model is still writing sentence 2.

- `?`, `!` and `।` end a sentence the moment they arrive.
- `.` needs one more character to decide: "3.5" (decimal), "Dr." / "e.g." (abbreviation) and
  "..." are not ends. A `.` is an end once whitespace follows it, or at `flush()`.
- Closing quotes/brackets and runs of terminators ("?!", "...") stay with their sentence.
"""

import re

TERMINATORS = ".?!।"
CLOSERS = "\"'”’)]"
# Lower-cased words that take a dot without ending a sentence.
ABBREVIATIONS = frozenset({"mr", "mrs", "ms", "dr", "st", "sr", "jr", "vs", "etc", "e.g", "i.e"})
MAX_CHARS = 200  # Timbre's per-call limit (see app/gnani/tts.py)


class SentenceSplitter:
    def __init__(self) -> None:
        self._buf = ""

    def feed(self, delta: str) -> list[str]:
        self._buf += delta
        out: list[str] = []
        while (end := self._find_end(self._buf)) is not None:
            sentence, self._buf = self._buf[:end], self._buf[end:]
            out.extend(_clean(sentence))
        return out

    def flush(self) -> list[str]:
        sentence, self._buf = self._buf, ""
        return _clean(sentence)

    @staticmethod
    def _find_end(buf: str) -> int | None:
        """Index just past the first complete sentence in buf, or None if there isn't one yet."""
        for i, ch in enumerate(buf):
            if ch not in TERMINATORS:
                continue
            j = i + 1
            while j < len(buf) and (buf[j] in TERMINATORS or buf[j] in CLOSERS):
                j += 1
            if j == len(buf):
                # Nothing after the terminator run yet. Unambiguous ones end now; a trailing "."
                # might still be "3." of "3.5" or the first dot of "...", so wait.
                return j if buf[j - 1] != "." and ch != "." else None
            if not buf[j].isspace():
                continue  # "3.5", "e.g.x", "U.S" — inside a token
            if ch == "." and j == i + 1 and _is_abbreviation(buf[:i]):
                continue
            return j
        return None


def _is_abbreviation(before: str) -> bool:
    word = re.split(r"\s", before)[-1].lower()
    return word in ABBREVIATIONS


def _clean(sentence: str) -> list[str]:
    s = sentence.strip()
    if not s.strip(TERMINATORS + CLOSERS + " "):
        return []  # punctuation only
    return chunk_for_tts(s)


def chunk_for_tts(text: str, limit: int = MAX_CHARS) -> list[str]:
    """Split text longer than Timbre's limit at the last comma, else the last space, else hard."""
    chunks: list[str] = []
    while len(text) > limit:
        window = text[: limit + 1]
        cut = max(window.rfind(", "), window.rfind("، "))
        cut = cut + 1 if cut > 0 else window.rfind(" ")
        if cut <= 0:
            cut = limit
        chunks.append(text[:cut].strip())
        text = text[cut:].strip()
    if text:
        chunks.append(text)
    return chunks
