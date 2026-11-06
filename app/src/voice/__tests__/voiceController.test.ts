import type { SchedulerHooks, Utterance } from '../../audio/scheduler';
import { Metrics } from '../../core/metrics';
import type { AskEvent, AskRequest } from '../../net/askClient';
import type { SttResult } from '../../net/sttClient';
import type { Track } from '../../vision/tracker';
import { route } from '../router';
import { VoiceController, type VoiceDeps } from '../voiceController';

const flush = () => new Promise<void>((r) => setImmediate(() => r()));

function setup(opts: { online?: boolean | null; stt?: SttResult; askEvents?: AskEvent[]; frame?: string | null } = {}) {
  let now = 0;
  const queue: Utterance[] = [];
  const all: Utterance[] = []; // every utterance ever enqueued
  const cancelled: string[] = [];
  const hooks: SchedulerHooks[] = [];
  const pushed: number[] = [];
  const asks: AskRequest[] = [];
  const log: string[] = [];
  let online = opts.online === undefined ? true : opts.online;
  const metrics = new Metrics(200, () => now);
  const reflex = {
    visible: [{ label: 'chair', dir: 'ahead', dist: 'near' } as Track],
    quiet: false,
    setQuiet(on: boolean) {
      this.quiet = on;
    },
  };
  let micCb: ((b: ArrayBuffer) => void) | null = null;
  const deps: VoiceDeps = {
    scheduler: {
      enqueue: (u) => {
        queue.push(u);
        all.push(u);
      },
      stopAll: () => void log.push('stopAll'),
      cancelWhere: (pred) => {
        const before = queue.length;
        for (let i = queue.length - 1; i >= 0; i--) if (pred(queue[i])) cancelled.push(queue.splice(i, 1)[0].id);
        return before - queue.length;
      },
      subscribe: (h) => {
        hooks.push(h);
        return () => {};
      },
    },
    metrics,
    lang: () => 'hi-en',
    online: () => online,
    reflex,
    startStt: () => ({
      push: (c) => void pushed.push(c.byteLength),
      finish: async () => {
        now += 400;
        return opts.stt ?? { ok: true, text: 'Saamne kya hai?' };
      },
      cancel: () => void log.push('stt.cancel'),
    }),
    startMic: async (cb) => {
      micCb = cb;
      log.push('mic.start');
    },
    stopMic: async () => void log.push('mic.stop'),
    grabFrame: async () => (opts.frame === undefined ? 'file:///ask.jpg' : opts.frame),
    ask: async (req, onEvent) => {
      asks.push(req);
      for (const e of opts.askEvents ?? []) onEvent(e);
    },
    writeAudio: async (b64) => `file:///ans-${b64}.mp3`,
    names: () => [],
    haptic: () => void log.push('haptic'),
    earcon: (n) => void log.push(`earcon:${n}`),
  };
  const vc = new VoiceController(deps, () => now);
  const talk = async (holdMs = 1000, chunks = 3) => {
    await vc.pressIn();
    for (let i = 0; i < chunks; i++) micCb?.(new ArrayBuffer(1280));
    now += holdMs;
    await vc.pressOut();
    await flush();
  };
  const said = () => queue.map((u) => u.parts.map((p) => (p.kind === 'clip' ? p.key : p.kind === 'file' ? p.uri : p.kind === 'speak' ? `speak:${p.text}` : '')).join(' '));
  return { vc, queue, all, cancelled, hooks, pushed, asks, log, metrics, reflex, talk, said, setOnline: (v: boolean | null) => (online = v), advance: (ms: number) => (now += ms) };
}

const SENTENCES: AskEvent[] = [
  { type: 'sentence', index: 0, text: 'Kursi aage hai.', audioB64: 'AAA' },
  { type: 'sentence', index: 1, text: 'Dhyan se.', audioB64: null, ttsError: 'rate_limited' },
  { type: 'done', timings: { first_audio_ms: 1500, total_ms: 2100 } },
];

test('press and release: haptics, earcons, mic → stt, then the answer is queued in order', async () => {
  const t = setup({ askEvents: SENTENCES });
  await t.talk();
  expect(t.log).toEqual(['haptic', 'stopAll', 'earcon:listen_start', 'mic.start', 'haptic', 'earcon:listen_stop', 'mic.stop']);
  expect(t.pushed).toEqual([1280, 1280, 1280]);
  expect(t.asks[0]).toMatchObject({ question: 'Saamne kya hai?', lang: 'hi-en', imageUri: 'file:///ask.jpg', detections: [{ cls: 'chair', dir: 'ahead', dist: 'near' }] });
  // the "looking" cue was queued, then cancelled when sentence 1 arrived (fake queue never plays)
  expect(t.cancelled).toEqual([expect.stringMatching(/:looking$/)]);
  expect(t.said()).toEqual(['file:///ans-AAA.mp3', 'speak:Dhyan se.']);
  expect(t.queue.every((u) => u.priority === 3 && u.source === 'answer')).toBe(true);
  expect(t.vc.lastTranscript).toBe('Saamne kya hai?');
  expect(t.vc.state).toBe('idle');
});

test('describe metrics: ptt_release, stt_final, ask_sent, first_sentence_rx and server timings', async () => {
  const t = setup({ askEvents: SENTENCES });
  await t.talk();
  const id = t.queue[0].id;
  const e = t.metrics.get(id)!;
  expect(Object.keys(e.stages)).toEqual(['ptt_release', 'stt_final', 'ask_sent', 'first_sentence_rx']);
  expect(e.stages.stt_final).toBe(400);
  expect(e.server).toEqual({ first_audio_ms: 1500, total_ms: 2100 });
});

test('offline at press: no STT session; release says "Internet nahi hai"', async () => {
  const t = setup({ online: false });
  await t.talk();
  expect(t.log).not.toContain('mic.start');
  expect(t.said()).toEqual(['sys.no_internet']);
});

test('a question while the server is unreachable → no internet; alerts are untouched', async () => {
  const t = setup({ online: true });
  await t.vc.pressIn();
  t.setOnline(false);
  t.advance(1000);
  await t.vc.pressOut();
  expect(t.said()).toEqual(['sys.no_internet']);
  expect(t.asks).toEqual([]);
});

test('a short tap is not speech: the session is cancelled silently', async () => {
  const t = setup();
  await t.talk(120);
  expect(t.log).toContain('stt.cancel');
  expect(t.queue).toEqual([]);
});

test('STT failure → "didn\'t hear"', async () => {
  const t = setup({ stt: { ok: false, code: 'stt_timeout' } });
  await t.talk();
  expect(t.said()).toEqual(['sys.didnt_hear']);
});

test('ask error before any sentence → answer failed', async () => {
  const t = setup({ askEvents: [{ type: 'error', code: 'vlm_timeout' }] });
  await t.talk();
  expect(t.said()).toEqual(['sys.looking', 'sys.answer_failed']);
});

test('no camera frame → answer failed without calling /ask', async () => {
  const t = setup({ frame: null });
  await t.talk();
  expect(t.asks).toEqual([]);
  expect(t.said()).toEqual(['sys.answer_failed']);
});

test('commands: stop, quiet, repeat, who, and stubs for later phases', async () => {
  const t = setup({ askEvents: SENTENCES });
  const run = (text: string) => t.vc.handle(route(text), 'id');
  await run('ruko');
  expect(t.log.at(-1)).toBe('stopAll');
  await run('quiet mode on');
  expect(t.reflex.quiet).toBe(true);
  await run('phir se bolo');
  await run('kaun hai');
  await run('isko Rahul ke naam se save karo');
  await run('ye padho');
  await run('Tamil mein bolo');
  expect(t.said()).toEqual(['sys.quiet_on', 'sys.nothing_to_repeat', 'sys.no_one_here', 'sys.not_available', 'sys.not_available', 'sys.not_available']);
});

test('repeat replays the last answer', async () => {
  const t = setup({ askEvents: SENTENCES });
  await t.talk();
  t.queue.length = 0;
  await t.vc.handle({ kind: 'repeat' }, 'id');
  expect(t.said()).toEqual(['file:///ans-AAA.mp3', 'speak:Dhyan se.']);
});

test('a hazard interrupting an answer drops the rest of it, including sentences still streaming', async () => {
  let deliverRest: () => void = () => {};
  const t = setup();
  // custom ask: first sentence now, the rest after the interruption
  const vcDeps = (t.vc as unknown as { d: VoiceDeps }).d;
  vcDeps.ask = (req, onEvent) =>
    new Promise<void>((resolve) => {
      onEvent(SENTENCES[0]);
      deliverRest = () => {
        onEvent(SENTENCES[1]);
        onEvent(SENTENCES[2]);
        resolve();
      };
    });
  const talking = t.talk();
  await flush();
  await flush();
  const first = t.queue.find((u) => u.source === 'answer')!;
  for (const h of t.hooks) h.onEnd?.(first, 'interrupted');
  deliverRest();
  await talking;
  await flush();
  const answers = t.all.filter((u) => u.source === 'answer').map((u) => u.parts[0]);
  expect(answers).toEqual([{ kind: 'file', uri: 'file:///ans-AAA.mp3', text: 'Kursi aage hai.' }]); // sentence 2 never queued
});

