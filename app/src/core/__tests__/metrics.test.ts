import { Metrics, percentile } from '../metrics';

function fakeClock(start = 1000) {
  let t = start;
  const clock = () => t;
  return { clock, advance: (ms: number) => (t += ms) };
}

test('percentile is nearest-rank', () => {
  expect(percentile([5, 1, 3], 50)).toBe(3);
  expect(percentile([5, 1, 3], 95)).toBe(5);
  expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95)).toBe(95);
  expect(percentile([], 50)).toBeNaN();
});

test('stages are stored as ms since the event start', () => {
  const { clock, advance } = fakeClock();
  const m = new Metrics(200, clock);
  const id = m.start('reflex', 'frame_ts');
  advance(30);
  m.mark(id, 'detect_done');
  advance(5);
  m.mark(id, 'enqueued');
  m.mark(id, 'enqueued', 99999); // second mark of a stage is ignored
  advance(10);
  m.mark(id, 'play_start');
  expect(m.get(id)!.stages).toEqual({ frame_ts: 0, detect_done: 30, enqueued: 35, play_start: 45 });
});

test('start can be backdated to an earlier stage time', () => {
  const { clock } = fakeClock(500);
  const m = new Metrics(200, clock);
  const id = m.start('reflex', 'frame_ts', 460);
  m.mark(id, 'detect_done');
  expect(m.get(id)!.stages.detect_done).toBe(40);
});

test('summary gives p50/p95 per kind and stage, skipping the start stage', () => {
  const { clock, advance } = fakeClock();
  const m = new Metrics(200, clock);
  for (const ms of [40, 60, 80, 100]) {
    const id = m.start('reflex', 'frame_ts');
    advance(ms);
    m.mark(id, 'play_start');
  }
  const d = m.start('describe', 'ptt_release');
  advance(1800);
  m.mark(d, 'play_start');
  const s = m.summary();
  expect(s.reflex.play_start).toEqual({ n: 4, p50: 60, p95: 100 });
  expect(s.reflex.frame_ts).toBeUndefined();
  expect(s.describe.play_start.p50).toBe(1800);
});

test('rolling window keeps only the latest events', () => {
  const m = new Metrics(3);
  const ids = [1, 2, 3, 4].map(() => m.start('system', 'start'));
  expect(m.get(ids[0])).toBeUndefined();
  expect(m.get(ids[3])).toBeDefined();
  m.mark(ids[0], 'late'); // evicted: ignored, no throw
});

test('export includes server timings and notes', () => {
  const m = new Metrics();
  const id = m.start('describe', 'ptt_release');
  m.attachServer(id, { first_audio_ms: 2400 });
  m.note(id, 'answer_failed');
  const out = JSON.parse(m.exportJson());
  expect(out.events[0]).toMatchObject({ id, server: { first_audio_ms: 2400 }, note: 'answer_failed' });
  expect(out.summary).toBeDefined();
});
