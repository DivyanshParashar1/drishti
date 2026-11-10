import type { SchedulerHooks, Utterance } from '../../audio/scheduler';
import { Signal } from '../../core/signal';
import { GRAMMAR, VoskWake, VOSK_MODEL, type VoskApi } from '../voskWake';
import { OFFLINE_TURN_MS, REFRACTORY_MS, type WakeTarget } from '../wakeWord';

const flush = () => new Promise<void>((r) => setImmediate(() => r()));
const FRAME_MS = 40;

function setup(opts: { online?: boolean; loadFails?: string } = {}) {
  let now = 0;
  const log: string[] = [];
  const cbs: { partial?: (t: string) => void; result?: (t: string) => void } = {};
  const vosk: VoskApi = {
    loadModel: async (p) => {
      if (opts.loadFails) throw new Error(opts.loadFails);
      log.push(`load ${p}`);
    },
    start: async (o) => void log.push(`start ${o.grammar.length}`),
    stop: () => void log.push('stop'),
    onResult: (cb) => ((cbs.result = cb), { remove: () => undefined }),
    onPartialResult: (cb) => ((cbs.partial = cb), { remove: () => undefined }),
    onError: () => ({ remove: () => undefined }),
  };
  const level = new Signal<[number]>();
  const changeCbs: (() => void)[] = [];
  const change = () => changeCbs.forEach((c) => c());
  let svc!: VoskWake;
  const target: WakeTarget & { state: 'idle' | 'listening' | 'busy' } = {
    state: 'idle',
    wake: async () => {
      log.push('wake');
      await svc.releaseMic(); // what startMic does
      target.state = 'listening';
      change();
    },
    pressOut: async () => {
      log.push('pressOut');
      target.state = 'idle';
      change();
    },
    cancel: async () => {
      log.push('cancel');
      target.state = 'idle';
      change();
    },
    onChange: (cb) => (changeCbs.push(cb), () => undefined),
  };
  const hooks: SchedulerHooks[] = [];
  svc = new VoskWake(
    {
      vosk,
      target,
      scheduler: { subscribe: (h) => (hooks.push(h), () => undefined) },
      micLevel: level,
      noSpeech: () => log.push('noSpeech'),
      online: () => opts.online ?? true,
      sleep: async () => undefined,
    },
    () => now,
  );
  /** The app's recorder levels during a turn, 40 ms apart. */
  const levels = async (lvl: number, ms: number) => {
    for (let t = 0; t < ms; t += FRAME_MS) {
      level.emit(lvl);
      now += FRAME_MS;
    }
    await flush();
  };
  const say = (text: string) => hooks.forEach((h) => h.onPlay?.([{ id: 'u', priority: 4, source: 'system', lang: 'hi', createdAt: 0, parts: [{ kind: 'speak', text }] } as Utterance], now));
  return { svc, log, target, cbs, levels, say, change, advance: (ms: number) => (now += ms) };
}

test('loads the Hindi model once and listens for दृष्टि with look-alike decoys', async () => {
  const t = setup();
  await t.svc.enable(true);
  expect(t.log).toEqual([`load ${VOSK_MODEL}`, `start ${GRAMMAR.length}`]);
  expect(GRAMMAR).toContain('[unk]');
  expect(t.svc.status).toEqual({ state: 'listening' });
  expect(t.svc.ownsMic).toBe(false);
  await t.svc.enable(false);
  await t.svc.enable(true);
  expect(t.log.filter((l) => l.startsWith('load'))).toHaveLength(1);
});

test('"दृष्टि" + a question: Vosk lets go of the mic, the turn ends by silence, then it listens again', async () => {
  const t = setup();
  await t.svc.enable(true);
  t.cbs.partial!('दृष्टि');
  await flush();
  expect(t.log.slice(2)).toEqual(['stop', 'wake']);
  expect(t.svc.status).toEqual({ state: 'paused' });
  await t.levels(0, 300);
  await t.levels(0.4, 1200);
  await t.levels(0.01, 1000);
  expect(t.log.slice(4)).toEqual(['pressOut', `start ${GRAMMAR.length}`]);
  expect(t.svc.status).toEqual({ state: 'listening' });
});

test('only the wake word counts; look-alikes and other words do not', async () => {
  const t = setup();
  await t.svc.enable(true);
  t.cbs.result!('दृश्य');
  t.cbs.partial!('कृष्णा [unk]');
  t.cbs.result!('[unk]');
  await flush();
  expect(t.log).not.toContain('wake');
  t.cbs.result!('[unk] दृष्टि');
  await flush();
  expect(t.log).toContain('wake');
});

test('"दृष्टि" then silence → cancelled with "didn\'t hear"', async () => {
  const t = setup();
  await t.svc.enable(true);
  t.cbs.partial!('दृष्टि');
  await flush();
  await t.levels(0.01, 5500);
  const after = t.log.slice(t.log.indexOf('wake') + 1);
  expect(after.filter((l) => l !== `start ${GRAMMAR.length}`)).toEqual(['cancel', 'noSpeech']);
  expect(after).toContain(`start ${GRAMMAR.length}`); // listening again
});

test('ignored while the app says its own name, and just after a turn', async () => {
  const t = setup();
  await t.svc.enable(true);
  t.say('नमस्ते, मैं दृष्टि हूँ');
  t.cbs.partial!('दृष्टि');
  await flush();
  expect(t.log).not.toContain('wake');
  t.target.state = 'busy'; // a hold-to-talk turn
  t.change();
  t.target.state = 'idle';
  t.change();
  t.cbs.partial!('दृष्टि');
  await flush();
  expect(t.log).not.toContain('wake');
  t.advance(REFRACTORY_MS);
  t.say('Saamne mez hai.'); // a line without the name: wake word allowed
  t.cbs.partial!('दृष्टि');
  await flush();
  expect(t.log).toContain('wake');
});

test('hold-to-talk: releaseMic stops Vosk; it listens again when the turn ends', async () => {
  const t = setup();
  await t.svc.enable(true);
  await t.svc.releaseMic();
  t.target.state = 'listening';
  t.change();
  expect(t.svc.status).toEqual({ state: 'paused' });
  await t.levels(0.01, 3000); // no endpointing on a hold: the release ends it
  expect(t.log).not.toContain('pressOut');
  t.target.state = 'idle';
  t.change();
  await flush();
  expect(t.log.filter((l) => l.startsWith('start'))).toHaveLength(2);
});

test('offline: a fixed window, then back to listening', async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  try {
    const t = setup({ online: false });
    await t.svc.enable(true);
    t.cbs.partial!('दृष्टि');
    await flush();
    jest.advanceTimersByTime(OFFLINE_TURN_MS);
    await flush();
    expect(t.log.slice(2)).toEqual(['stop', 'wake', 'pressOut', `start ${GRAMMAR.length}`]);
  } finally {
    jest.useRealTimers();
  }
});

test('a model that fails to load shows the error and stays off', async () => {
  const t = setup({ loadFails: 'Model directory does not exist' });
  await t.svc.enable(true);
  expect(t.svc.status).toEqual({ state: 'error', message: 'Model directory does not exist' });
  expect(t.svc.on).toBe(false);
});
