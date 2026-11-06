import { SttSession, type WebSocketLike } from '../sttClient';

jest.mock('expo-constants', () => ({ expoConfig: { extra: { serverUrl: 'https://relay.example', appToken: 'tok' } } }));

class FakeWs implements WebSocketLike {
  static last: FakeWs;
  binaryType?: string;
  readyState = 0;
  sent: (string | number)[] = []; // strings, or byte lengths for binary
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  constructor(
    public url: string,
    public headers: Record<string, string>,
  ) {
    FakeWs.last = this;
  }
  send(d: string | ArrayBuffer) {
    this.sent.push(typeof d === 'string' ? d : d.byteLength);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  reply(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}
const factory = (url: string, headers: Record<string, string>) => new FakeWs(url, headers);

afterEach(() => jest.useRealTimers());

test('connects to wss /stt with the bearer token', () => {
  new SttSession(factory, 'hi-en');
  expect(FakeWs.last.url).toBe('wss://relay.example/stt');
  expect(FakeWs.last.headers).toEqual({ Authorization: 'Bearer tok' });
  expect(FakeWs.last.binaryType).toBe('arraybuffer');
});

test('buffers PCM until open, then sends lang, PCM, end; resolves with the final', async () => {
  const s = new SttSession(factory, 'ta');
  s.push(new ArrayBuffer(1280));
  s.push(new ArrayBuffer(640));
  const ws = FakeWs.last;
  expect(ws.sent).toEqual([]);
  ws.open();
  s.push(new ArrayBuffer(320));
  const done = s.finish();
  expect(ws.sent).toEqual(['{"lang":"ta"}', 1280, 640, 320, '{"type":"end"}']);
  ws.reply({ type: 'final', text: 'முன்னால் என்ன இருக்கிறது', lang: 'ta' });
  expect(await done).toEqual({ ok: true, text: 'முன்னால் என்ன இருக்கிறது' });
  expect(ws.closed).toBe(true);
});

test('release before the socket opens still sends end after the buffered audio', async () => {
  const s = new SttSession(factory, 'en');
  s.push(new ArrayBuffer(100));
  const done = s.finish();
  s.push(new ArrayBuffer(50)); // after release: ignored
  FakeWs.last.open();
  expect(FakeWs.last.sent).toEqual(['{"lang":"en"}', 100, '{"type":"end"}']);
  FakeWs.last.reply({ type: 'final', text: 'hello' });
  expect(await done).toEqual({ ok: true, text: 'hello' });
});

test('server error code is passed through', async () => {
  const s = new SttSession(factory, 'hi');
  FakeWs.last.open();
  const done = s.finish();
  FakeWs.last.reply({ type: 'error', code: 'credits_exhausted' });
  expect(await done).toEqual({ ok: false, code: 'credits_exhausted' });
});

test('no final within 3 s → stt_timeout', async () => {
  jest.useFakeTimers();
  const s = new SttSession(factory, 'hi-en');
  FakeWs.last.open();
  const done = s.finish();
  jest.advanceTimersByTime(3000);
  expect(await done).toEqual({ ok: false, code: 'stt_timeout' });
});

test('socket error or close before a final', async () => {
  const s = new SttSession(factory, 'hi-en');
  FakeWs.last.onerror?.(new Error('refused'));
  expect(await s.finish()).toEqual({ ok: false, code: 'stt_unreachable' });
  const s2 = new SttSession(factory, 'hi-en');
  FakeWs.last.open();
  const done = s2.finish();
  FakeWs.last.onclose?.({});
  expect(await done).toEqual({ ok: false, code: 'stt_closed' });
});

test('cancel closes the socket and resolves as cancelled', async () => {
  const s = new SttSession(factory, 'hi-en');
  s.cancel();
  expect(FakeWs.last.closed).toBe(true);
  expect(await s.finish()).toEqual({ ok: false, code: 'cancelled' });
});
