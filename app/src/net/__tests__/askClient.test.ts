import { ask, buildAskForm, toAskEvent, type AskEvent, type AskRequest, type StreamingTransport } from '../askClient';

jest.mock('expo-constants', () => ({ expoConfig: { extra: { serverUrl: 'http://srv:8000', appToken: 'tok' } } }));

const REQ: AskRequest = {
  question: 'Saamne kya hai?',
  lang: 'hi-en',
  detections: [{ cls: 'chair', dir: 'ahead', dist: 'near' }],
  names: ['Rahul'],
  imageUri: 'file:///cache/ask-1.jpg',
};

const SSE =
  'event: sentence\ndata: {"index": 0, "text": "Kursi aage hai.", "audio_b64": "SUQz", "mime": "audio/mpeg"}\n\n' +
  'event: sentence\ndata: {"index": 1, "text": "Dhyan se.", "audio_b64": null, "mime": null, "tts_error": "rate_limited"}\n\n' +
  'event: done\ndata: {"timings": {"vlm_first_token_ms": 800, "total_ms": 2100}}\n\n';

function transport(chunks: string[], status = 200, body = ''): StreamingTransport & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async post(url, form, headers, onChunk) {
      calls.push({ url, form, headers });
      for (const c of chunks) onChunk(c);
      return { status, body };
    },
  };
}

async function collect(t: StreamingTransport): Promise<AskEvent[]> {
  const out: AskEvent[] = [];
  await ask(t, REQ, (e) => out.push(e));
  return out;
}

test('form has question, lang, detections, names and the JPEG as a file part', () => {
  // Jest's FormData is Node's; record appends the way React Native's FormData receives them.
  const real = globalThis.FormData;
  class RecordingFormData {
    parts: Record<string, unknown> = {};
    append(k: string, v: unknown) {
      this.parts[k] = v;
    }
  }
  (globalThis as { FormData: unknown }).FormData = RecordingFormData;
  try {
    const { parts } = buildAskForm(REQ) as unknown as RecordingFormData;
    expect(parts.question).toBe('Saamne kya hai?');
    expect(parts.lang).toBe('hi-en');
    expect(JSON.parse(parts.detections as string)).toEqual(REQ.detections);
    expect(JSON.parse(parts.names as string)).toEqual(['Rahul']);
    expect(parts.image).toEqual({ uri: 'file:///cache/ask-1.jpg', name: 'frame.jpg', type: 'image/jpeg' });
  } finally {
    globalThis.FormData = real;
  }
});

test('posts to /ask with the token', async () => {
  const t = transport([SSE]);
  await collect(t);
  expect(t.calls[0]).toMatchObject({ url: 'http://srv:8000/ask', headers: { Authorization: 'Bearer tok' } });
});

test('sentences and done stream through, even when chunks split events', async () => {
  const chunks = SSE.match(/.{1,7}/gs)!;
  expect(await collect(transport(chunks))).toEqual([
    { type: 'sentence', index: 0, text: 'Kursi aage hai.', audioB64: 'SUQz', en: null },
    { type: 'sentence', index: 1, text: 'Dhyan se.', audioB64: null, en: null, ttsError: 'rate_limited' },
    { type: 'done', timings: { vlm_first_token_ms: 800, total_ms: 2100 } },
  ]);
});

test('server error event ends the stream', async () => {
  const ev = await collect(transport(['event: error\ndata: {"code": "vlm_timeout", "timings": {}}\n\n']));
  expect(ev).toEqual([{ type: 'error', code: 'vlm_timeout', timings: {} }]);
});

test('HTTP errors map to the server code', async () => {
  expect(await collect(transport([], 503, '{"code":"vlm_not_configured"}'))).toEqual([
    { type: 'error', code: 'vlm_not_configured' },
  ]);
  expect(await collect(transport([], 502, 'Bad gateway'))).toEqual([{ type: 'error', code: 'http_502' }]);
});

test('network failure → ask_unreachable; a stream that just stops → stream_ended', async () => {
  const failing: StreamingTransport = { post: async () => Promise.reject(new Error('network')) };
  expect(await collect(failing)).toEqual([{ type: 'error', code: 'ask_unreachable' }]);
  const cut = SSE.slice(0, SSE.indexOf('event: done'));
  const ev = await collect(transport([cut]));
  expect(ev.map((e) => e.type)).toEqual(['sentence', 'sentence', 'error']);
  expect(ev[2]).toEqual({ type: 'error', code: 'stream_ended' });
});

test('unknown or malformed events are ignored', () => {
  expect(toAskEvent('ping', '{}')).toBeNull();
  expect(toAskEvent('sentence', 'not json')).toBeNull();
});

test('F12: English line on a sentence, and a late gloss event that does not end the stream', () => {
  expect(toAskEvent('sentence', JSON.stringify({ index: 0, text: 'Kursi aage hai.', audio_b64: null, en: 'A chair is ahead.' }))).toMatchObject({
    type: 'sentence',
    en: 'A chair is ahead.',
  });
  expect(toAskEvent('gloss', JSON.stringify({ index: 1, en: 'Go slowly.' }))).toEqual({ type: 'gloss', index: 1, en: 'Go slowly.' });
  expect(toAskEvent('gloss', JSON.stringify({ index: 1, en: '' }))).toBeNull();
});
