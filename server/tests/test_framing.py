from app.gnani.framing import FRAME_BYTES, PcmFramer


def test_exact_frames_from_uneven_chunks():
    f = PcmFramer()
    out = []
    data = bytes(range(256)) * 13  # 3,328 bytes
    for i in range(0, len(data), 640):  # 20 ms chunks at 16 kHz
        out += f.push(data[i : i + 640])
    assert [len(x) for x in out] == [FRAME_BYTES] * 3
    assert b"".join(out) == data[: 3 * FRAME_BYTES]
    tail = f.flush()
    assert len(tail) == FRAME_BYTES
    assert tail[: len(data) - 3 * FRAME_BYTES] == data[3 * FRAME_BYTES :]
    assert set(tail[len(data) - 3 * FRAME_BYTES :]) == {0}


def test_flush_empty_and_after_exact_multiple():
    f = PcmFramer()
    assert f.flush() is None
    assert len(f.push(bytes(2048))) == 2
    assert f.flush() is None


def test_one_big_chunk():
    assert len(PcmFramer().push(bytes(FRAME_BYTES * 5 + 1))) == 5
