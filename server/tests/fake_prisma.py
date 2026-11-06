"""A scripted stand-in for Prisma's realtime WebSocket, for tests (no credits)."""

import asyncio
import json
from contextlib import asynccontextmanager

import websockets
from websockets.frames import Close

from app.gnani.errors import UpstreamError


class FakePrisma:
    """
    on_frames: {frame_count: [messages]} — emitted after that many audio frames arrive.
    on_commit: messages emitted after the commit frame.
    close_after_commit / handshake_error: simulate upstream closes and refused handshakes.
    """

    def __init__(
        self,
        on_frames=None,
        on_commit=None,
        handshake_error=None,
        commit_delay=0.0,
        close_after_frames=None,
    ):
        self.on_frames = on_frames or {}
        self.on_commit = on_commit if on_commit is not None else []
        self.handshake_error = handshake_error
        self.commit_delay = commit_delay
        self.close_after_frames = close_after_frames
        self.frames: list[bytes] = []
        self.texts: list[str] = []
        self.headers: dict | None = None
        self.url: str | None = None
        self._out: asyncio.Queue = asyncio.Queue()
        self.closed = False

    # Connector interface
    def __call__(self, url, headers):
        self.url, self.headers = url, headers
        return self._connect()

    @asynccontextmanager
    async def _connect(self):
        if self.handshake_error:
            raise UpstreamError(self.handshake_error)
        await self._out.put(json.dumps({"type": "connected"}))
        yield self

    async def send(self, data):
        if self.closed:
            raise websockets.ConnectionClosed(Close(1000, ""), None)
        if isinstance(data, bytes):
            self.frames.append(data)
            for m in self.on_frames.get(len(self.frames), []):
                await self._out.put(json.dumps(m))
            if self.close_after_frames == len(self.frames):
                await self._out.put(None)
        else:
            self.texts.append(data)
            if json.loads(data).get("type") == "commit":
                asyncio.get_running_loop().create_task(self._emit_commit())

    async def _emit_commit(self):
        await asyncio.sleep(self.commit_delay)
        for m in self.on_commit:
            await self._out.put(None if m is None else json.dumps(m))

    def __aiter__(self):
        return self

    async def __anext__(self):
        item = await self._out.get()
        if item is None:
            self.closed = True
            raise StopAsyncIteration
        return item
