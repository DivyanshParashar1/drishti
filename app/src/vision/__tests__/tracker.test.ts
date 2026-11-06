import { Tracker } from '../tracker';
import type { Box, Detection } from '../types';

const det = (label: string, box: Box, score = 0.8): Detection => ({ label, score, box });
const chairAhead: Box = [0.4, 0.3, 0.6, 0.6]; // ahead, far (30% tall, bottom 0.6)
const FRAME_MS = 100; // ~10 detections/s

/** Feed one detection list per frame; collect alerts as "label:reason:dir:dist@t". */
function run(tracker: Tracker, frames: (Detection[] | null)[], start = 0): string[] {
  const out: string[] = [];
  frames.forEach((dets, i) => {
    const t = start + i * FRAME_MS;
    for (const a of tracker.update(dets ?? [], t).alerts) {
      out.push(`${a.track.label}:${a.reason}:${a.track.dir}:${a.track.dist}@${t}`);
    }
  });
  return out;
}

test('a chair held still for 30 s gives exactly one alert, despite jitter and missed frames', () => {
  const tr = new Tracker();
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const frames = Array.from({ length: 300 }, (_, i) => {
    if (i % 23 === 5 || rand() < 0.15) return null; // detector misses ~15% of frames
    const j = (rand() - 0.5) * 0.02;
    return [det('chair', [0.4 + j, 0.3 + j, 0.6 + j, 0.6 + j])];
  });
  const alerts = run(tr, frames);
  expect(alerts).toHaveLength(1);
  expect(alerts[0]).toMatch(/^chair:new:ahead:far@\d+$/);
});

test('far → near re-announces, even inside the class cooldown', () => {
  const tr = new Tracker();
  const frames = [
    [det('chair', chairAhead)],
    [det('chair', [0.38, 0.3, 0.62, 0.7])], // 40% tall, still far
    [det('chair', [0.35, 0.3, 0.65, 0.88])], // bottom in lowest 15% → near
    [det('chair', [0.35, 0.3, 0.65, 0.9])],
  ];
  expect(run(tr, frames)).toEqual(['chair:new:ahead:far@0', 'chair:near:ahead:near@200']);
});

/** A person drifting from ahead (cx 0.5) to the right in small steps, so IoU keeps matching. */
function drift(frames: number, stepPerFrame: number): Detection[][] {
  return Array.from({ length: frames }, (_, i) => {
    const x = Math.min(0.35 + i * stepPerFrame, 0.65);
    return [det('person', [x, 0.3, x + 0.3, 0.6])];
  });
}

test('a direction change after the cooldown re-announces at once', () => {
  const alerts = run(new Tracker(), drift(80, 0.005)); // reaches the right third after ~4.5 s
  expect(alerts[0]).toBe('person:new:ahead:far@0');
  const [, t] = alerts[1].match(/^person:direction:right:far@(\d+)$/)!;
  expect(Number(t)).toBeGreaterThan(4000);
  expect(alerts).toHaveLength(2);
});

test('a direction change inside the cooldown is spoken when the cooldown ends', () => {
  const alerts = run(new Tracker(), drift(60, 0.02)); // right after ~1 s
  expect(alerts).toEqual(['person:new:ahead:far@0', 'person:direction:right:far@4000']);
});

test('per-class cooldown: one chair alert per 4 s; held-back chairs speak in turn', () => {
  const left: Box = [0.05, 0.3, 0.25, 0.6];
  const right: Box = [0.75, 0.3, 0.95, 0.6];
  const frames = Array.from({ length: 90 }, (_, i) => [
    det('chair', chairAhead),
    det('chair', left),
    ...(i >= 30 ? [det('chair', right)] : []),
  ]);
  expect(run(new Tracker(), frames)).toEqual([
    'chair:new:ahead:far@0',
    'chair:new:left:far@4000',
    'chair:new:right:far@8000',
  ]);
});

test('cooldown is per class: a car right after a chair still speaks', () => {
  const tr = new Tracker();
  expect(run(tr, [[det('chair', chairAhead)], [det('chair', chairAhead), det('car', [0.0, 0.2, 0.3, 0.5])]])).toEqual([
    'chair:new:ahead:far@0',
    'car:new:left:far@100',
  ]);
});

test('gone for more than 3 s and back → announced again; a short gap is not', () => {
  const tr = new Tracker();
  const seen = [det('dog', chairAhead)];
  const short = [seen, ...Array(25).fill(null), seen]; // 2.6 s gap
  expect(run(tr, short)).toEqual(['dog:new:ahead:far@0']);
  const tr2 = new Tracker();
  const long = [seen, ...Array(45).fill(null), seen]; // 4.6 s gap
  expect(run(tr2, long)).toEqual(['dog:new:ahead:far@0', 'dog:new:ahead:far@4600']);
});

test('a new object that is already near bypasses the cooldown', () => {
  const tr = new Tracker();
  const nearLeft: Box = [0.0, 0.2, 0.3, 0.9];
  expect(run(tr, [[det('chair', chairAhead)], [det('chair', chairAhead), det('chair', nearLeft)]])).toEqual([
    'chair:new:ahead:far@0',
    'chair:new:left:near@100',
  ]);
});

test('matching is per class and stable: two people keep their ids', () => {
  const tr = new Tracker();
  const a: Box = [0.05, 0.3, 0.25, 0.6];
  const b: Box = [0.7, 0.3, 0.9, 0.6];
  const u1 = tr.update([det('person', a), det('person', b)], 0);
  const u2 = tr.update([det('person', b), det('person', a)], 100);
  expect(u2.visible.map((t) => t.id)).toEqual([u1.visible[1].id, u1.visible[0].id]);
  const u3 = tr.update([det('chair', a)], 200); // same place, other class → new track
  expect(u3.visible[0].id).not.toBe(u1.visible[0].id);
});
