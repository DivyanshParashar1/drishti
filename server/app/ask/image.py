"""Read a JPEG's pixel size from its SOF header, without decoding (no Pillow needed)."""

# SOF0–SOF15 carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) share the range but don't.
_SOF = frozenset(range(0xC0, 0xD0)) - {0xC4, 0xC8, 0xCC}
_NO_LENGTH = frozenset({0x01, *range(0xD0, 0xD8)})  # TEM, RST0–7: markers without a payload


def jpeg_size(data: bytes) -> tuple[int, int] | None:
    """(width, height), or None if data isn't a well-formed JPEG header."""
    if data[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            return None
        marker = data[i + 1]
        if marker == 0xFF:  # fill byte
            i += 1
            continue
        if marker in _NO_LENGTH:
            i += 2
            continue
        length = int.from_bytes(data[i + 2 : i + 4], "big")
        if marker in _SOF:
            if i + 9 > len(data):
                return None
            height = int.from_bytes(data[i + 5 : i + 7], "big")
            width = int.from_bytes(data[i + 7 : i + 9], "big")
            return width, height
        if marker in (0xD9, 0xDA) or length < 2:  # EOI / start of scan before any SOF
            return None
        i += 2 + length
    return None
