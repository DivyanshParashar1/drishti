import type { SchedulerHooks, Utterance } from '../../audio/scheduler';
import { OFFLINE_TURN_MS, REFRACTORY_MS, toPcmBytes, WakeService, type FrameSource, type WakeEngine, type WakeTarget } from '../wakeWord';

const FRAME_MS = 32;
const QUIET = Array<number>(512).fill(30);
const LOUD = Array<number>(512).fill(3000); // level 0.5
const WAKE = Array<number>(512).fill(-1); // the fake engine "hears" Drishti in this frame

const flush = () => new Promise<void>((r) => setImmediate(() => r()));

function setup(opts: { configured?: boolean; online?: boolean; engineFails?: string } = {}) {
  let now = 0;
  const log: string[] = [];
  const frameCbs: ((f: number[]) => void)[] = [];
  const source: FrameSource = {
    start: async (len, rate) => void log.push(`mic.start ${len}@${rate}`),
    stop: async () => void log.push('mic.stop'),
    addFrameListener: (cb) => frameCbs.push(cb),
    removeFrameListener: (cb) => frameCbs.splice(frameCbs.indexOf(cb) >>> 0, 1),
    addErrorListener: () => undefined,
    removeErrorListener: () => undefined,
  };
  const engine: WakeEngine = {
    frameLength: 512,
    sampleRate: 16000,
    process: async (f) => (f[0] === -1 ? 0 : -1),
    delete: async () => void log.push('engine.delete'),
  };
  const changeCbs: (() => void)[] = [];
  const pushed: number[] = [];
  let svc!: WakeService;
  const target: WakeTarget & { state: 'idle' | 'listening' | 'busy' } = {
    state: 'idle',
    wake: async () => {
      log.push('wake');
      target.state = 'listening';
      changeCbs.forEach((c) => c());
      if (opts.online === false) await svc.suspend(); // what useVoiceController does offline
      else svc.tap((pcm) => pushed.push(pcm.byteLength));
    },
    pressOut: async () => {
      log.push('pressOut');
      svc.untap();
      target.state = 'idle';
      changeCbs.forEach((c) => c());
    },
    cancel: async () => {
      log.push('cancel');
      svc.untap();
      target.state = 'idle';
      changeCbs.forEach((c) => c());
    },
    onChange: (cb) => {
      changeCbs.push(cb);
      return () => undefined;
    },
  };
  const hooks: SchedulerHooks[] = [];
  svc = new WakeService(
    {
      createEngine: async () => {
        if (opts.engineFails) throw new Error(opts.engineFails);
        return engine;
      },
      source,
      target,
      scheduler: { subscribe: (h) => (hooks.push(h), () => undefined) },
      noSpeech: () => log.push('noSpeech'),
      online: () => opts.online ?? true,
      configured: opts.configured ?? true,
    },
    () => now,
  );
  /** Feed frames 32 ms apart, letting the async engine settle after each. */
  const feed = async (frames: number[][]) => {
    for (const f of frames) {
      for (const cb of [...frameCbs]) cb(f);
      await flush();
      now += FRAME_MS;
    }
  };
  const repeat = (f: number[], ms: number) => Array<number[]>(Math.ceil(ms / FRAME_MS)).fill(f);
  const say = (text: string) => hooks.forEach((h) => h.onPlay?.([{ id: 'u', priority: 4, source: 'system', lang: 'hi-en', createdAt: 0, parts: [{ kind: 'speak', text }] } as Utterance], now));
  const ended = () => hooks.forEach((h) => h.onEnd?.({} as Utterance, 'done'));
  return { svc, log, target, pushed, feed, repeat, say, ended, advance: (ms: number) => (now += ms) };
}

test('"Drishti", a question, then quiet: one turn, frames go to STT, ended by silence', async () => {
  const t = setup();
  await t.svc.enable(true);
  expect(t.svc.status).toEqual({ state: 'listening' });
  expect(t.svc.ownsMic).toBe(true);
  await t.feed([...t.repeat(QUIET, 1000), WAKE]);
  expect(t.log).toEqual(['mic.start 512@16000', 'wake']);
  await t.feed([...t.repeat(QUIET, 300), ...t.repeat(LOUD, 1200), ...t.repeat(QUIET, 1100)]);
  expect(t.log.filter((l) => l === 'pressOut')).toHaveLength(1);
  expect(t.pushed.length).toBeGreaterThan(40);
  expect(t.pushed.every((b) => b === 1024)).toBe(true); // 512 samples × 2 bytes
});

test('"Drishti" and nothing else: cancelled with "didn\'t hear"', async () => {
  const t = setup();
  await t.svc.enable(true);
  await t.feed([WAKE, ...t.repeat(QUIET, 5500)]);
  expect(t.log).toEqual(['mic.start 512@16000', 'wake', 'cancel', 'noSpeech']);
});

test('no wake while a turn is open, during the refractory gap, or while the app says its own name', async () => {
  const t = setup();
  await t.svc.enable(true);
  t.target.state = 'busy'; // waiting for an answer
  await t.feed([WAKE]);
  t.target.state = 'idle';
  t.say('Namaste, main Drishti hoon');
  await t.feed([WAKE]);
  t.ended();
  expect(t.log).toEqual(['mic.start 512@16000']);
  await t.feed([WAKE, ...t.repeat(LOUD, 400), ...t.repeat(QUIET, 1000)]); // a real turn
  expect(t.log.slice(-2)).toEqual(['wake', 'pressOut']);
  await t.feed([WAKE]); // right after the turn: ignored
  expect(t.log.filter((l) => l === 'wake')).toHaveLength(1);
  t.advance(REFRACTORY_MS);
  await t.feed([WAKE]);
  expect(t.log.filter((l) => l === 'wake')).toHaveLength(2);
});

test('an answer that does not mention Drishti can be interrupted by the wake word', async () => {
  const t = setup();
  await t.svc.enable(true);
  t.say('Saamne ek mez hai.');
  await t.feed([WAKE]);
  expect(t.log).toContain('wake');
});

test('hold-to-talk while the wake word owns the mic: frames tapped, no loudness ending', async () => {
  const t = setup();
  await t.svc.enable(true);
  const got: number[] = [];
  t.svc.tap((pcm, level) => got.push(level));
  t.target.state = 'listening';
  await t.feed([...t.repeat(LOUD, 300), ...t.repeat(QUIET, 3000)]);
  expect(t.log).not.toContain('pressOut'); // the release ends a hold, not silence
  expect(got[0]).toBeCloseTo(0.5);
  t.svc.untap();
});

test('offline: the recognizer gets the mic for a fixed window, then the wake word resumes', async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  try {
    const t = setup({ online: false });
    await t.svc.enable(true);
    await t.feed([WAKE]);
    expect(t.svc.status).toEqual({ state: 'paused' });
    expect(t.svc.ownsMic).toBe(false);
    jest.advanceTimersByTime(OFFLINE_TURN_MS);
    await flush();
    expect(t.log).toEqual(['mic.start 512@16000', 'wake', 'mic.stop', 'pressOut', 'mic.start 512@16000']);
    await flush();
    expect(t.svc.status).toEqual({ state: 'listening' });
  } finally {
    jest.useRealTimers();
  }
});

test('not configured → no_key; a bad key → error; off releases everything', async () => {
  const a = setup({ configured: false });
  await a.svc.enable(true);
  expect(a.svc.status).toEqual({ state: 'no_key' });
  expect(a.log).toEqual([]);
  const b = setup({ engineFails: 'PorcupineActivationError: AccessKey is invalid' });
  await b.svc.enable(true);
  expect(b.svc.status).toEqual({ state: 'error', message: 'PorcupineActivationError: AccessKey is invalid' });
  expect(b.svc.ownsMic).toBe(false);
  const c = setup();
  await c.svc.enable(true);
  await c.svc.enable(false);
  expect(c.log).toEqual(['mic.start 512@16000', 'mic.stop', 'engine.delete']);
  expect(c.svc.status).toEqual({ state: 'off' });
});

test('PCM bytes are little-endian int16', () => {
  const b = new Uint8Array(toPcmBytes([1, -2, 300]));
  expect([...b]).toEqual([1, 0, 0xfe, 0xff, 0x2c, 0x01]);
});

test('every frame reaches the detector in order, even back to back and while the app speaks', async () => {
  const seen: number[] = [];
  const t = setup();
  await t.svc.enable(true);
  // Swap in a recording engine through the public surface: frames are 1-sample markers.
  (t.svc as unknown as { engine: { process(f: number[]): Promise<number>; reset(): void; frameLength: number; sampleRate: number; delete(): Promise<void> } }).engine = {
    frameLength: 512,
    sampleRate: 16000,
    process: async (f) => (seen.push(f[0]), -1),
    reset: () => seen.push(-99),
    delete: async () => undefined,
  };
  t.say('Namaste, main Drishti hoon');
  await t.feed([[1], [2], [3]]);
  expect(seen).toEqual([1, 2, 3]);
  t.svc.tap(() => undefined);
  t.svc.untap();
  expect(seen).toEqual([1, 2, 3, -99]); // reset after a turn
});
