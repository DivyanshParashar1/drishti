import { ENDPOINT, Endpointer, NoiseFloor, type EndpointResult } from '../endpointer';

const FRAME = 32; // Porcupine: 512 samples at 16 kHz

/** Feed levels one frame apart; return the first non-'continue' result and when it happened. */
function run(e: Endpointer, levels: number[]): { result: EndpointResult; at: number } {
  for (let i = 0; i < levels.length; i++) {
    const r = e.feed(levels[i], i * FRAME);
    if (r !== 'continue') return { result: r, at: i * FRAME };
  }
  return { result: 'continue', at: -1 };
}
const frames = (ms: number, level: number) => Array<number>(Math.ceil(ms / FRAME)).fill(level);

test('speech then 900 ms of quiet ends the turn', () => {
  const r = run(new Endpointer(0.02), [...frames(300, 0), ...frames(1200, 0.3), ...frames(2000, 0.01)]);
  expect(r.result).toBe('end');
  expect(r.at).toBeGreaterThanOrEqual(300 + 1200 + 900 - FRAME);
  expect(r.at).toBeLessThan(300 + 1200 + 900 + 2 * FRAME);
});

test('a short pause inside the question does not end it', () => {
  const e = new Endpointer(0.02);
  const r = run(e, [...frames(600, 0.3), ...frames(500, 0.01), ...frames(600, 0.3), ...frames(1200, 0.01)]);
  expect(r.result).toBe('end');
  expect(r.at).toBeGreaterThan(1700 + 800);
});

test('nothing said within 5 s → no_speech', () => {
  expect(run(new Endpointer(0.02), frames(6000, 0.01))).toEqual({ result: 'no_speech', at: expect.any(Number) });
});

test('the listen earcon at the start is ignored, and a single click is not speech', () => {
  const e = new Endpointer(0.02);
  const r = run(e, [...frames(200, 0.9), 0.9, ...frames(6000, 0.01)]); // earcon, then one loud frame
  expect(r.result).toBe('no_speech');
  expect(e.heardSpeech).toBe(false);
});

test('a long monologue is cut at 10 s', () => {
  const r = run(new Endpointer(0.02), frames(12_000, 0.3));
  expect(r.result).toBe('end');
  expect(r.at).toBeGreaterThanOrEqual(ENDPOINT.maxMs);
});

test('a noisy room raises the threshold: street noise is not speech, a voice above it is', () => {
  const quiet = new Endpointer(0.01);
  const noisy = new Endpointer(0.08);
  expect(quiet.threshold).toBe(ENDPOINT.minLevel);
  expect(noisy.threshold).toBeCloseTo(0.2);
  expect(run(noisy, frames(6000, 0.12)).result).toBe('no_speech');
  expect(run(new Endpointer(0.08), [...frames(500, 0.4), ...frames(1500, 0.1)]).result).toBe('end');
});

test('noise floor follows the room but barely moves for loud bursts', () => {
  const f = new NoiseFloor(0.02);
  for (let i = 0; i < 300; i++) f.feed(0.05);
  expect(f.value).toBeCloseTo(0.05, 2);
  for (let i = 0; i < 30; i++) f.feed(0.6); // someone talking for a second
  expect(f.value).toBeLessThan(0.09);
});
