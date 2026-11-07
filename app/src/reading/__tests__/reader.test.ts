import type { EndReason, SchedulerHooks, Utterance } from '../../audio/scheduler';
import { Metrics } from '../../core/metrics';
import type { TtsResult } from '../../net/ttsClient';
import { Reader } from '../reader';
import { readImage, type Recognize } from '../ocr';

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise<void>((r) => setImmediate(() => r()));
};

function setup(opts: { online?: boolean | null; tts?: (text: string) => TtsResult } = {}) {
  const queue: Utterance[] = [];
  const hooks: SchedulerHooks[] = [];
  const ttsCalls: string[] = [];
  let online = opts.online === undefined ? true : opts.online;
  let n = 0;
  const reader = new Reader({
    scheduler: {
      enqueue: (u) => void queue.push(u),
      subscribe: (h) => {
        hooks.push(h);
        return () => {};
      },
    },
    metrics: new Metrics(),
    lang: () => 'hi-en',
    online: () => online,
    tts: async (text) => {
      ttsCalls.push(text);
      return opts.tts ? opts.tts(text) : { ok: true, mp3: new ArrayBuffer(2) };
    },
    writeAudio: async () => `file:///read-${n++}.mp3`,
  });
  const end = (reason: EndReason = 'done') => {
    const u = queue.shift()!;
    hooks.forEach((h) => h.onEnd?.(u, reason));
    return u;
  };
  const texts = () => queue.map((u) => (u.parts[0].kind === 'clip' ? u.parts[0].key : (u.parts[0] as { text: string }).text));
  return { reader, queue, ttsCalls, end, texts, setOnline: (v: boolean | null) => (online = v) };
}

const PARAS = ['Notice. Library closed on Sunday.', 'Timings 9 to 5.', 'Contact the office.'];

test('reads paragraphs in order, one chunk queued at a time, P3 reading, then "Bas itna hi likha hai"', async () => {
  const t = setup();
  t.reader.start(PARAS, 'm1');
  await flush();
  expect(t.texts()).toEqual(['Notice. Library closed on Sunday.']);
  expect(t.queue[0]).toMatchObject({ priority: 3, source: 'reading', id: 'm1' });
  expect(t.queue[0].parts[0]).toMatchObject({ kind: 'file', uri: 'file:///read-0.mp3' });
  t.end();
  await flush();
  expect(t.texts()).toEqual(['Timings 9 to 5.']);
  t.end();
  await flush();
  t.end();
  await flush();
  expect(t.texts()).toEqual(['sys.reading_done']);
  expect(t.reader.state).toBe('idle');
});

test('the next chunk is prefetched while the current one plays', async () => {
  const t = setup();
  t.reader.start(PARAS, 'm1');
  await flush();
  expect(t.ttsCalls).toEqual(['Notice. Library closed on Sunday.', 'Timings 9 to 5.']);
  t.end();
  await flush();
  expect(t.ttsCalls).toHaveLength(3); // chunk 2 was already fetched; chunk 3 prefetched now
});

test('offline, or when /tts fails, chunks are spoken with expo-speech', async () => {
  const t = setup({ online: false });
  t.reader.start(PARAS, 'm1');
  await flush();
  expect(t.queue[0].parts[0]).toEqual({ kind: 'speak', text: 'Notice. Library closed on Sunday.' });
  expect(t.ttsCalls).toEqual([]);

  const u = setup({ tts: () => ({ ok: false, code: 'rate_limited' }) });
  u.reader.start(PARAS, 'm2');
  await flush();
  expect(u.queue[0].parts[0]).toEqual({ kind: 'speak', text: 'Notice. Library closed on Sunday.' });
});

test('"aage" (next) skips the rest of the paragraph', async () => {
  const t = setup();
  const long = Array.from({ length: 6 }, (_, k) => `Sentence number ${k} of the first paragraph is here and it is quite long indeed.`).join(' ');
  t.reader.start([long, 'Second paragraph.'], 'm1');
  await flush();
  expect(t.reader.progress.chunks).toBeGreaterThan(2);
  t.reader.pause(); // user pressed talk
  t.end('stopped'); // stopAll cut the chunk
  await flush();
  expect(t.reader.state).toBe('paused');
  t.reader.next();
  await flush();
  expect(t.texts()).toEqual(['Second paragraph.']);
});

test('pause + resume replays the cut chunk; "ruko" (stop) ends reading', async () => {
  const t = setup();
  t.reader.start(PARAS, 'm1');
  await flush();
  t.reader.pause();
  t.end('stopped');
  await flush();
  expect(t.queue).toEqual([]);
  t.reader.resume();
  await flush();
  expect(t.texts()).toEqual(['Notice. Library closed on Sunday.']);
  t.reader.pause();
  t.end('stopped');
  t.reader.stop();
  await flush();
  expect(t.queue).toEqual([]);
  expect(t.reader.state).toBe('idle');
});

test('a chunk that finished as the user pressed is not repeated on resume', async () => {
  const t = setup();
  t.reader.start(PARAS, 'm1');
  await flush();
  t.reader.pause();
  t.end('done');
  t.reader.resume();
  await flush();
  expect(t.texts()).toEqual(['Timings 9 to 5.']);
});

test('while paused, a chunk still being fetched is not queued', async () => {
  let release: (r: TtsResult) => void = () => {};
  const t = setup();
  // slow tts for the first chunk
  (t.reader as unknown as { d: { tts: unknown } }).d.tts = () => new Promise<TtsResult>((r) => (release = r));
  t.reader.start(PARAS, 'm1');
  t.reader.pause();
  release({ ok: true, mp3: new ArrayBuffer(1) });
  await flush();
  expect(t.queue).toEqual([]);
});

test('a hazard interrupting a chunk replays that chunk (reading resumes, unlike answers)', async () => {
  const t = setup();
  t.reader.start(PARAS, 'm1');
  await flush();
  t.end('interrupted');
  await flush();
  expect(t.texts()).toEqual(['Notice. Library closed on Sunday.']);
});

test('stopAll without a pause (e.g. debug "Stop all") pauses the reader', async () => {
  const t = setup();
  t.reader.start(PARAS, 'm1');
  await flush();
  t.end('stopped');
  expect(t.reader.state).toBe('paused');
});

test('no paragraphs → nothing happens', () => {
  const t = setup();
  t.reader.start([], 'm1');
  expect(t.reader.state).toBe('idle');
});

describe('readImage', () => {
  const blocks = (text: string) => [{ text, frame: { top: 0, left: 0, width: 10, height: 10 } }];
  test('Devanagari text: the Devanagari model result is used; Latin is not run', async () => {
    const calls: string[] = [];
    const rec: Recognize = async (_u, script) => {
      calls.push(script);
      return { text: 'सूचना', blocks: blocks('सूचना') };
    };
    expect(await readImage('file:///x.jpg', rec)).toEqual({ paragraphs: ['सूचना'], script: 'Devanagari' });
    expect(calls).toEqual(['Devanagari']);
  });
  test('no Devanagari found: the Latin model is used', async () => {
    const rec: Recognize = async (_u, script) =>
      script === 'Latin' ? { text: 'Notice', blocks: blocks('Notice') } : { text: 'Notlce', blocks: blocks('Notlce') };
    expect(await readImage('file:///x.jpg', rec)).toEqual({ paragraphs: ['Notice'], script: 'Latin' });
  });
  test('nothing found by either: empty', async () => {
    const rec: Recognize = async () => ({ text: '', blocks: [] });
    expect((await readImage('file:///x.jpg', rec)).paragraphs).toEqual([]);
  });
});
