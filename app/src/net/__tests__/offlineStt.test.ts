import { OfflineSttSession, type Recognizer } from '../offlineStt';

function fakeRecognizer(opts: { throwOnStart?: boolean } = {}) {
  const listeners: Record<string, ((e?: unknown) => void)[]> = { result: [], error: [], end: [] };
  const log: string[] = [];
  const rec = {
    start: (o: { lang: string; requiresOnDeviceRecognition: boolean }) => {
      if (opts.throwOnStart) throw new Error('no service');
      log.push(`start ${o.lang} onDevice=${o.requiresOnDeviceRecognition}`);
    },
    stop: () => void log.push('stop'),
    abort: () => void log.push('abort'),
    addListener: (ev: string, cb: (e?: unknown) => void) => {
      listeners[ev].push(cb);
      return { remove: () => (listeners[ev] = listeners[ev].filter((l) => l !== cb)) };
    },
  } as unknown as Recognizer;
  const emit = (ev: 'result' | 'error' | 'end', e?: unknown) => listeners[ev].forEach((l) => l(e));
  return { rec, log, emit, count: () => Object.values(listeners).flat().length };
}

test('starts on-device recognition in the language locale; finish returns the last transcript', async () => {
  const f = fakeRecognizer();
  const s = new OfflineSttSession(f.rec, 'hi-en');
  expect(f.log).toEqual(['start hi-IN onDevice=true']);
  f.emit('result', { isFinal: false, results: [{ transcript: 'ruk' }] });
  f.emit('result', { isFinal: true, results: [{ transcript: ' रुको ' }] });
  const p = s.finish();
  expect(f.log.at(-1)).toBe('stop');
  f.emit('end');
  expect(await p).toEqual({ ok: true, text: 'रुको' });
  expect(f.count()).toBe(0); // listeners removed
});

test('no speech → empty; other errors → offline_<code>; locales per language', async () => {
  const a = fakeRecognizer();
  const s1 = new OfflineSttSession(a.rec, 'ta');
  expect(a.log[0]).toBe('start ta-IN onDevice=true');
  a.emit('error', { error: 'no-speech' });
  expect(await s1.finish()).toEqual({ ok: false, code: 'empty' });

  const b = fakeRecognizer();
  const s2 = new OfflineSttSession(b.rec, 'en');
  b.emit('error', { error: 'language-not-supported' });
  expect(await s2.finish()).toEqual({ ok: false, code: 'offline_language-not-supported' });
});

test('a recognizer that never ends: finish resolves after the timeout with what it has', async () => {
  jest.useFakeTimers();
  try {
    const f = fakeRecognizer();
    const s = new OfflineSttSession(f.rec, 'hi', 3000);
    f.emit('result', { isFinal: false, results: [{ transcript: 'quiet mode' }] });
    const p = s.finish();
    jest.advanceTimersByTime(3000);
    expect(await p).toEqual({ ok: true, text: 'quiet mode' });
  } finally {
    jest.useRealTimers();
  }
});

test('start throwing (no recognition service) → finish fails fast; cancel aborts', async () => {
  const f = fakeRecognizer({ throwOnStart: true });
  const s = new OfflineSttSession(f.rec, 'hi-en');
  expect(await s.finish()).toEqual({ ok: false, code: 'offline_start_failed' });
  const g = fakeRecognizer();
  new OfflineSttSession(g.rec, 'hi-en').cancel();
  expect(g.log.at(-1)).toBe('abort');
  expect(g.count()).toBe(0);
});
