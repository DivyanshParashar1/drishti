import pytest

from app.ask.splitter import SentenceSplitter, chunk_for_tts


def split_stream(deltas: list[str]) -> list[list[str]]:
    """Feed deltas one by one; return what each feed emitted, plus the flush at the end."""
    s = SentenceSplitter()
    return [s.feed(d) for d in deltas] + [s.flush()]


def split_all(text: str) -> list[str]:
    """Feed one character at a time (worst case for streaming) and collect every sentence."""
    s = SentenceSplitter()
    out = [x for ch in text for x in s.feed(ch)]
    return out + s.flush()


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Car aage hai. Left se jao.", ["Car aage hai.", "Left se jao."]),
        ("Kya ye bus hai? Haan!", ["Kya ye bus hai?", "Haan!"]),
        ("सामने सीढ़ियाँ हैं। बाएँ जाइए।", ["सामने सीढ़ियाँ हैं।", "बाएँ जाइए।"]),
        ("Door 2.5 metres ahead. Go slow.", ["Door 2.5 metres ahead.", "Go slow."]),
        ("Dr. Rao is ahead. Mr. Shah left.", ["Dr. Rao is ahead.", "Mr. Shah left."]),
        ("Look, e.g. the kerb. Careful.", ["Look, e.g. the kerb.", "Careful."]),
        ("Wait... a car. Stop!", ["Wait...", "a car.", "Stop!"]),
        ('He said "stop." Then left.', ['He said "stop."', "Then left."]),
        # "?" emits at once, so a "!" arriving later is dropped as a punctuation-only remnant.
        ("Really?! Yes.", ["Really?", "Yes."]),
        ("No terminator at the end", ["No terminator at the end"]),
        ("", []),
        ("  .  ", []),
    ],
)
def test_splits(text, expected):
    assert split_all(text) == expected


def test_question_mark_emits_immediately():
    # "?" is unambiguous: sentence 1 must not wait for the next token.
    assert split_stream(["Kya ye", " bus hai?", " Haan"]) == [[], ["Kya ye bus hai?"], [], ["Haan"]]


def test_danda_emits_immediately():
    assert split_stream(["सामने कार है।", " रुकिए"]) == [["सामने कार है।"], [], ["रुकिए"]]


def test_dot_waits_for_next_char():
    assert split_stream(["Bus 42 hai.", " Aage"]) == [[], ["Bus 42 hai."], ["Aage"]]
    assert split_stream(["Pole 3.", "5 steps ahead."]) == [[], [], ["Pole 3.5 steps ahead."]]
    assert split_stream(["Ruko!", " Aage"]) == [["Ruko!"], [], ["Aage"]]


def test_multiple_sentences_in_one_delta():
    assert split_stream(["A car. A bus. A"]) == [["A car.", "A bus."], ["A"]]


def test_long_sentence_is_chunked_for_tts():
    sentence = ("word " * 60).strip() + "."
    out = split_all(sentence)
    assert len(out) > 1
    assert all(len(x) <= 200 for x in out)
    assert " ".join(out) == sentence


def test_chunk_prefers_comma():
    text = "a" * 150 + ", " + "b" * 100
    assert chunk_for_tts(text) == ["a" * 150 + ",", "b" * 100]


def test_chunk_hard_cut_without_spaces():
    assert chunk_for_tts("x" * 450) == ["x" * 200, "x" * 200, "x" * 50]
