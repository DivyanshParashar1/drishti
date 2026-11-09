import type { AudioPart, Priority, SchedulerHooks, Source, Utterance } from '../../audio/scheduler';
import type { Lang } from '../../core/lang';
import { Metrics } from '../../core/metrics';
import { Signal } from '../../core/signal';
import type { DialogPhase } from '../../identity/enrollment';
import { route } from '../../voice/router';
import type { Heard } from '../../voice/voiceController';
import { commandLabel, FLASH_MS, HudStore } from '../hudStore';

let now = 0;

function setup() {
  now = 0;
  const hooks: SchedulerHooks[] = [];
  const enqueued: Utterance[] = [];
  const said: string[] = [];
  const metrics = new Metrics(200, () => now);
  const voiceL: (() => void)[] = [];
  const glossL: ((id: string, text: string, en: string) => void)[] = [];
  const voice = {
    state: 'idle' as 'idle' | 'listening' | 'busy',
    thinking: false,
    heard: null as Heard | null,
    onChange: (cb: () => void) => (voiceL.push(cb), () => {}),
    onGloss: (cb: (id: string, text: string, en: string) => void) => (glossL.push(cb), () => {}),
  };
  const readerL: (() => void)[] = [];
  const reader = { state: 'idle' as 'idle' | 'playing' | 'paused', progress: { chunk: 2, chunks: 5, block: 1 }, onChange: (cb: () => void) => (readerL.push(cb), () => {}) };
  const enrolL: (() => void)[] = [];
  const enrollment = { phase: 'idle' as DialogPhase, onChange: (cb: () => void) => (enrolL.push(cb), () => {}) };
  const netL: ((o: boolean, p: boolean | null) => void)[] = [];
  const langChanged = new Signal<[Lang]>();
  const demoChanged = new Signal<[boolean, boolean]>();
  let lang: Lang = 'hi-en';
  const store = new HudStore({
    scheduler: { subscribe: (h) => (hooks.push(h), () => {}), enqueue: (u) => void enqueued.push(u) },
    metrics,
    voice,
    reader,
    enrollment,
    connectivity: { online: null, onChange: (cb) => (netL.push(cb), () => {}) },
    lang: () => lang,
    langChanged,
    demoChanged,
    firstRun: () => true,
    say: (k) => void said.push(k),
    captureMs: 4000,
    now: () => now,
  });
  const play = (...members: Utterance[]) => hooks.forEach((h) => h.onPlay?.(members, now));
  const end = (u: Utterance, reason: 'done' | 'interrupted' | 'stopped' = 'done') => hooks.forEach((h) => h.onEnd?.(u, reason));
  const voiceChanged = () => voiceL.forEach((l) => l());
  return {
    store,
    metrics,
    voice,
    reader,
    enrollment,
    enqueued,
    said,
    play,
    end,
    voiceChanged,
    gloss: (id: string, text: string, en: string) => glossL.forEach((l) => l(id, text, en)),
    readerChanged: () => readerL.forEach((l) => l()),
    enrolChanged: () => enrolL.forEach((l) => l()),
    net: (o: boolean, p: boolean | null) => netL.forEach((l) => l(o, p)),
    langChanged,
    demoChanged,
    setLang: (l: Lang) => (lang = l),
  };
}

const utt = (id: string, parts: AudioPart[], source: Source = 'system', priority: Priority = 4): Utterance => ({ id, priority, source, lang: 'hi-en', parts, createdAt: now });
const chairNear = (id: string) =>
  utt(
    id,
    [
      { kind: 'clip', key: 'obj.chair' },
      { kind: 'clip', key: 'dir.ahead' },
      { kind: 'clip', key: 'dist.near' },
    ],
    'reflex',
    0,
  );

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('a played alert becomes the caption with its measured latency; it stays 6 s after speech, then fades', () => {
  const t = setup();
  const id = t.metrics.start('reflex', 'frame_ts');
  now = 38;
  t.metrics.mark(id, 'play_start');
  const u = chairNear(id);
  t.play(u);
  const s = t.store.get();
  expect(s.caption).toMatchObject({ tag: 'ALERT', tone: 'near', line1: 'Kursi aage, paas', speaking: true, visible: true });
  expect(s.latency).toEqual({ label: 'ALERT', tone: 'near', ms: 38, where: 'on device', p50: 38, p95: 38 });
  expect(s.pulse?.keys).toEqual(['obj.chair']);

  t.end(u);
  expect(t.store.get().caption?.speaking).toBe(false);
  jest.advanceTimersByTime(5999);
  expect(t.store.get().caption?.visible).toBe(true);
  jest.advanceTimersByTime(1);
  expect(t.store.get().caption?.visible).toBe(false);
  jest.advanceTimersByTime(250);
  expect(t.store.get().caption).toBeNull();
});

test('latency: system lines and replays never touch the card; an answer is timed once, by its first sentence', () => {
  const t = setup();
  t.play(utt(t.metrics.start('system', 'enqueued'), [{ kind: 'clip', key: 'sys.saved' }]));
  expect(t.store.get().latency).toBeNull();
  const id = t.metrics.start('describe', 'ptt_release');
  now = 1400;
  t.metrics.mark(id, 'play_start');
  t.play(utt(id, [{ kind: 'speak', text: 'Ek.' }], 'answer', 3));
  expect(t.store.get().latency).toMatchObject({ label: 'ANSWER', ms: 1400, where: 'cloud', tone: 'brand' });
  t.play(utt(id, [{ kind: 'speak', text: 'Do.' }], 'answer', 3));
  expect(t.store.get().latency?.ms).toBe(1400);
});

test('answer streaming keeps the previous sentence dimmed above; a late English line fills in', () => {
  const t = setup();
  t.play(utt('a1', [{ kind: 'speak', text: 'Saamne gali hai.', en: 'A lane is ahead.' }], 'answer', 3));
  t.play(utt('a1', [{ kind: 'speak', text: 'Left mein auto hai.' }], 'answer', 3));
  expect(t.store.get().caption).toMatchObject({ prev: 'Saamne gali hai.', line1: 'Left mein auto hai.', line2: null });
  t.gloss('a1', 'Left mein auto hai.', 'An auto is on the left.');
  expect(t.store.get().caption?.line2).toBe('An auto is on the left.');
  t.gloss('other', 'Left mein auto hai.', 'nope');
  expect(t.store.get().caption?.line2).toBe('An auto is on the left.');
});

test('an urgent alert interrupting an answer: the answer is struck through above it and the panel flashes', () => {
  const t = setup();
  const a = utt('a1', [{ kind: 'speak', text: 'Saamne ek chaudi gali hai.' }], 'answer', 3);
  t.play(a);
  t.end(a, 'interrupted');
  t.play(utt('r1', [{ kind: 'clip', key: 'sys.step_drop' }], 'reflex', 0));
  expect(t.store.get()).toMatchObject({ cut: 'Saamne ek chaudi gali hai.', flash: true, caption: { tag: 'ALERT', line1: 'Aage seedhi ya girav' } });
  jest.advanceTimersByTime(FLASH_MS);
  expect(t.store.get().flash).toBe(false);
  t.play(utt('s1', [{ kind: 'clip', key: 'sys.saved' }]));
  expect(t.store.get().cut).toBeNull();
});

test('transcript bubble: what was heard and the command; cleared when the user talks again', () => {
  const t = setup();
  t.voice.state = 'busy';
  t.voice.thinking = true;
  t.voice.heard = { seq: 1, text: 'saamne kya hai?', cmd: route('saamne kya hai?') };
  t.voiceChanged();
  expect(t.store.get()).toMatchObject({ voice: 'thinking', bubble: { text: 'saamne kya hai?', label: 'describe' } });
  t.voice.state = 'listening';
  t.voice.thinking = false;
  t.voiceChanged();
  expect(t.store.get()).toMatchObject({ voice: 'listening', bubble: null });
});

test('a bubble with no caption after it goes after the hold; with one, it goes with the caption', () => {
  const t = setup();
  t.voice.heard = { seq: 1, text: 'ruko', cmd: { kind: 'stop' } };
  t.voiceChanged();
  jest.advanceTimersByTime(6000);
  expect(t.store.get().bubble).toBeNull();
  t.voice.heard = { seq: 2, text: '', cmd: null };
  t.voiceChanged();
  expect(t.store.get().bubble).toEqual({ text: '', label: null });
  const u = utt('s', [{ kind: 'clip', key: 'sys.didnt_hear' }]);
  t.play(u);
  jest.advanceTimersByTime(10_000); // still speaking: the caption (and bubble) stay
  expect(t.store.get().bubble).not.toBeNull();
  t.end(u);
  jest.advanceTimersByTime(6250);
  expect(t.store.get().bubble).toBeNull();
});

test('reading shows para/chunk; the strip chip goes when reading stops', () => {
  const t = setup();
  t.reader.state = 'playing';
  t.play(utt('r', [{ kind: 'speak', text: 'पार्किंग निषेध' }], 'reading', 3));
  expect(t.store.get().caption?.meta).toBe('para 2 · chunk 3/5');
  expect(t.store.get().reading).toEqual({ chunk: 3, chunks: 5 });
  t.reader.state = 'idle';
  t.readerChanged();
  expect(t.store.get().reading).toBeNull();
});

test('enrolment: consent badge, countdown while capturing, tick when saved', () => {
  const t = setup();
  t.enrollment.phase = 'consent';
  t.enrolChanged();
  t.play(utt('c', [{ kind: 'clip', key: 'sys.consent' }]));
  expect(t.store.get()).toMatchObject({ enrol: 'consent', caption: { badge: 'consent' }, capture: null });
  now = 500;
  t.enrollment.phase = 'capturing';
  t.enrolChanged();
  expect(t.store.get().capture).toEqual({ startedAt: 500, durationMs: 4000 });
  t.enrollment.phase = 'idle';
  t.enrolChanged();
  now = 4600;
  t.play(utt('s', [{ kind: 'clip', key: 'sys.saved' }]));
  expect(t.store.get()).toMatchObject({ capture: null, savedAt: 4600 });
});

test('first run: tutorial step and the cane line', () => {
  const t = setup();
  t.play(utt('c', [{ kind: 'clip', key: 'sys.cane' }]));
  expect(t.store.get().caption).toMatchObject({ meta: 'First run · 2/7', tutorial: { index: 2, total: 7 } });
});

test('toasts: internet lost/back (not at startup), demo mode by the user; language chip flashes on a switch', () => {
  const t = setup();
  t.net(true, null);
  expect(t.store.get()).toMatchObject({ online: true, toast: null });
  t.net(false, true);
  expect(t.store.get().toast).toMatchObject({ text: 'Internet lost. Alerts are still on.', tone: 'offline' });
  jest.advanceTimersByTime(3000);
  expect(t.store.get().toast).toBeNull();
  t.demoChanged.emit(false, false); // the saved setting loading: silent
  expect(t.store.get().toast).toBeNull();
  t.demoChanged.emit(false, true);
  expect(t.store.get().toast).toMatchObject({ text: 'Demo mode off', tone: 'brand' });
  jest.advanceTimersByTime(1000);
  expect(t.store.get().toast).toBeNull();

  t.langChanged.emit('ta'); // saved language at startup: no flash
  expect(t.store.get()).toMatchObject({ lang: 'ta', langFlash: false });
  t.langChanged.emit('en');
  expect(t.store.get()).toMatchObject({ lang: 'en', langFlash: true });
  jest.advanceTimersByTime(300);
  expect(t.store.get().langFlash).toBe(false);
});

test('right temple: repeat replays the last entry as a non-urgent, untimed line; nothing yet → says so', () => {
  const t = setup();
  t.store.repeatLast();
  expect(t.said).toEqual(['sys.nothing_to_repeat']);
  expect(t.store.get().feedback).toBe('repeat');
  jest.advanceTimersByTime(600);
  expect(t.store.get().feedback).toBeNull();
  const u = chairNear('r1');
  t.play({ ...u, frameId: 4 });
  t.store.repeatLast();
  expect(t.enqueued).toHaveLength(1);
  expect(t.enqueued[0]).toMatchObject({ source: 'reflex', priority: 3, parts: u.parts, frameId: undefined });
  expect(t.metrics.get(t.enqueued[0].id)?.kind).toBe('system');
});

test('command labels', () => {
  expect(commandLabel(route('isko Priya ke naam se save karo'))).toBe('save "Priya"');
  expect(commandLabel(route('ye padho'))).toBe('read');
  expect(commandLabel(route('ruko'))).toBe('stop');
  expect(commandLabel(route('shaant mode'))).toBe('quiet on');
  expect(commandLabel('dialog')).toBe('answer');
  expect(commandLabel(null)).toBeNull();
});
