import { CHUNK, EMBED_DIM, FEATURES, HISTORY, MEL_BINS, MEL_FRAMES, MEL_WINDOW, OwwEngine, type OwwModels } from '../oww';

/** Fake models that record what they were given. */
function fakes(score: (n: number) => number = () => 0) {
  const melIn: Float32Array[] = [];
  const embIn: Float32Array[] = [];
  const clsIn: Float32Array[] = [];
  const models: OwwModels = {
    melspec: (x) => {
      melIn.push(x.slice());
      return new Float32Array(MEL_FRAMES * MEL_BINS).fill(10 * melIn.length); // → n + 2 after transform
    },
    embed: (m) => {
      embIn.push(m.slice());
      return new Float32Array(EMBED_DIM).fill(embIn.length);
    },
    classify: (f) => {
      clsIn.push(f.slice());
      return score(clsIn.length);
    },
  };
  return { models, melIn, embIn, clsIn };
}
const samples = (n: number, start = 0) => Array.from({ length: n }, (_, i) => start + i);

test('80 ms chunks: the melspec model gets the chunk plus 480 samples of history', () => {
  const f = fakes();
  const e = new OwwEngine(f.models);
  e.feed(samples(CHUNK - 1));
  expect(f.melIn).toHaveLength(0);
  e.feed(samples(CHUNK + 1, CHUNK - 1)); // completes chunk 1 and chunk 2 in one call
  expect(f.melIn).toHaveLength(2);
  expect(f.melIn[0].length).toBe(HISTORY + CHUNK);
  expect(Array.from(f.melIn[0].slice(0, HISTORY))).toEqual(Array(HISTORY).fill(0)); // silence before the start
  expect(f.melIn[0][HISTORY]).toBe(0);
  expect(f.melIn[1][0]).toBe(CHUNK - HISTORY); // history = the last 480 samples of chunk 1
  expect(f.melIn[1][HISTORY]).toBe(CHUNK); // then chunk 2
});

test('640-sample recorder frames add up to the same chunks', async () => {
  const f = fakes();
  const e = new OwwEngine(f.models);
  for (let i = 0; i < 4; i++) await e.process(samples(640, i * 640));
  expect(f.melIn).toHaveLength(2);
  expect(f.melIn[1][HISTORY]).toBe(CHUNK);
});

test('mel buffer: starts as ones, shifts 8 frames per chunk, values transformed x/10 + 2', () => {
  const f = fakes();
  const e = new OwwEngine(f.models);
  e.feed(samples(2 * CHUNK));
  const [m1, m2] = f.embIn;
  expect(m1.length).toBe(MEL_WINDOW * MEL_BINS);
  const tail = (m: Float32Array, frames: number) => Array.from(m.slice((MEL_WINDOW - frames) * MEL_BINS));
  expect(Array.from(m1.slice(0, (MEL_WINDOW - MEL_FRAMES) * MEL_BINS)).every((v) => v === 1)).toBe(true);
  expect(tail(m1, MEL_FRAMES).every((v) => v === 3)).toBe(true); // raw 10 → 3
  expect(tail(m2, MEL_FRAMES).every((v) => v === 4)).toBe(true); // newest chunk last
  expect(Array.from(m2.slice((MEL_WINDOW - 2 * MEL_FRAMES) * MEL_BINS, (MEL_WINDOW - MEL_FRAMES) * MEL_BINS)).every((v) => v === 3)).toBe(true);
});

test('no score until 16 features; then the last 16 in order', () => {
  const f = fakes();
  const e = new OwwEngine(f.models);
  e.feed(samples(15 * CHUNK));
  expect(f.clsIn).toHaveLength(0);
  e.feed(samples(2 * CHUNK));
  expect(f.clsIn).toHaveLength(2);
  const last = f.clsIn[1];
  expect(last.length).toBe(FEATURES * EMBED_DIM);
  expect(last[0]).toBe(2); // features 2..17 (feature n is filled with n)
  expect(last[FEATURES * EMBED_DIM - 1]).toBe(17);
});

test('a score ≥ 0.5 is a detection, once: features are cleared afterwards', async () => {
  const f = fakes((n) => (n >= 3 ? 0.9 : 0.1));
  const e = new OwwEngine(f.models);
  const hits: number[] = [];
  for (let i = 0; i < 40; i++) hits.push(await e.process(samples(640)));
  const firsts = hits.flatMap((h, i) => (h === 0 ? [i] : []));
  // first score at chunk 16 (frame 31), detection at the 3rd score (frame 35); then 16 more chunks needed
  expect(firsts).toEqual([35]);
  expect(e.lastScore).toBe(0.9);
});
