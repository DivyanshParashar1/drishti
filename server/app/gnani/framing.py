"""Re-chunk arbitrary PCM chunks into the exact frames Prisma's realtime API requires.

Prisma: 16-bit LE mono PCM, exactly 1,024 bytes (512 samples = 32 ms at 16 kHz) per frame.
"""

FRAME_BYTES = 1024


class PcmFramer:
    def __init__(self, frame_bytes: int = FRAME_BYTES):
        self.frame_bytes = frame_bytes
        self._buf = bytearray()

    def push(self, chunk: bytes) -> list[bytes]:
        self._buf.extend(chunk)
        n = len(self._buf) // self.frame_bytes
        frames = [
            bytes(self._buf[i * self.frame_bytes : (i + 1) * self.frame_bytes]) for i in range(n)
        ]
        del self._buf[: n * self.frame_bytes]
        return frames

    def flush(self) -> bytes | None:
        """The leftover partial frame, zero-padded (silence), or None if nothing is left."""
        if not self._buf:
            return None
        frame = bytes(self._buf) + bytes(self.frame_bytes - len(self._buf))
        self._buf.clear()
        return frame
