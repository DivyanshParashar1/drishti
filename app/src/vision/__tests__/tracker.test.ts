import { Tracker } from '../tracker';
import type { Box, Detection } from '../types';

const det = (label: string, box: Box, score = 0.8): Detection => ({ label, score, box });
const chairAhead: Box = [0.4, 0.3, 0.6, 0.6];
const FRAME_MS = 100; // ~10 detections/s

/** Feed one detection list per frame; collect alerts as "label:dir@t". */
function run(tracker: Tracker, frames: (Detection[] | null)[], start = 0): string[] {
  const out: string[] = [];
  frames.forEach((dets, i) => {
    const t = start + i * FRAME_MS;
    for (const a of tracker.update(dets ?? [], t).alerts) out.push(`${a.track.label}:${a.track.dir}@${t}`);
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
  expect(alerts[0]).toMatch(/^chair:ahead@\d+$/);
});

test('walking toward an object: announced when it appears, once more when it turns near', () => {
  const tr = new Tracker();
  const frames = [
    [det('chair', chairAhead)],
    [det('chair', [0.38, 0.3, 0.62, 0.7])],
    [det('chair', [0.35, 0.3, 0.65, 0.88])], // bottom in the lowest 15% → near (inside the 4 s cooldown)
    [det('chair', [0.35, 0.3, 0.65, 0.9])],
    [det('chair', [0.3, 0.1, 0.7, 0.95])],
  ];
  expect(run(tr, frames)).toEqual(['chair:ahead@0', 'chair:ahead@200']);
  expect(tr.all[0].dist).toBe('near');
});

test('an object first seen near is announced as near once, and never again while tracked', () => {
  const tr = new Tracker();
  const near: Box = [0.3, 0.2, 0.7, 0.95];
  const a = tr.update([det('chair', near)], 0).alerts;
  expect(a.map((x) => [x.reason, x.track.dist])).toEqual([['new', 'near']]);
  expect(tr.update([det('chair', near)], 100).alerts).toEqual([]);
});

test('a direction change is tracked but not announced', () => {
  const tr = new Tracker();
  const frames = Array.from({ length: 80 }, (_, i) => {
    const x = Math.min(0.35 + i * 0.005, 0.65);
    return [det('person', [x, 0.3, x + 0.3, 0.6])];
  });
  expect(run(tr, frames)).toEqual(['person:ahead@0']);
  expect(tr.all[0].dir).toBe('right');
});

test('per-class cooldown: a second chair within 4 s is never announced, a later one is', () => {
  const left: Box = [0.05, 0.3, 0.25, 0.6];
  const right: Box = [0.75, 0.3, 0.95, 0.6];
  const frames = Array.from({ length: 50 }, (_, i) => [
    det('chair', chairAhead),
    ...(i >= 1 ? [det('chair', left)] : []), // at 100 ms: inside the cooldown → silent
    ...(i >= 45 ? [det('chair', right)] : []), // at 4.5 s: after it → spoken
  ]);
  expect(run(new Tracker(), frames)).toEqual(['chair:ahead@0', 'chair:right@4500']);
});

test('cooldown is per class: a car right after a chair still speaks', () => {
  const tr = new Tracker();
  expect(run(tr, [[det('chair', chairAhead)], [det('chair', chairAhead), det('car', [0.0, 0.2, 0.3, 0.5])]])).toEqual([
    'chair:ahead@0',
    'car:left@100',
  ]);
});

test('gone for more than 3 s and back → announced again; a short gap is not', () => {
  const seen = [det('dog', chairAhead)];
  expect(run(new Tracker(), [seen, ...Array(25).fill(null), seen])).toEqual(['dog:ahead@0']); // 2.6 s gap
  expect(run(new Tracker(), [seen, ...Array(45).fill(null), seen])).toEqual(['dog:ahead@0', 'dog:ahead@4600']); // 4.6 s
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
