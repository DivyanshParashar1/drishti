import type { Utterance } from '../../audio/scheduler';
import { Metrics } from '../../core/metrics';
import { ReflexLane, type FrameResult } from '../reflexLane';
import type { Detection } from '../types';

function setup() {
  let now = 1000;
  const enqueued: Utterance[] = [];
  const metrics = new Metrics(200, () => now);
  const lane = new ReflexLane({ enqueue: (u) => enqueued.push(u) }, metrics, 'hi-en', () => now);
  const frame = (dets: Detection[], frameNo = 1, totalMs = 40): FrameResult => ({
    frameNo, detections: dets, frameWidth: 480, frameHeight: 640, preprocessMs: 10, inferMs: 25, totalMs,
  });
  return { lane, enqueued, metrics, frame, advance: (ms: number) => (now += ms) };
}

const chair: Detection = { label: 'chair', score: 0.8, box: [0.4, 0.3, 0.6, 0.6] };
const car: Detection = { label: 'car', score: 0.9, box: [0.0, 0.3, 0.3, 0.6] };

test('a new chair is enqueued once with reflex metrics backdated to the frame', () => {
  const { lane, enqueued, metrics, frame, advance } = setup();
  lane.handle(frame([chair]));
  advance(100);
  lane.handle(frame([chair], 2));
  expect(enqueued).toHaveLength(1);
  const u = enqueued[0];
  expect(u.parts).toEqual([
    { kind: 'clip', key: 'obj.chair' },
    { kind: 'clip', key: 'dir.ahead' },
    { kind: 'clip', key: 'dist.far' },
  ]);
  expect(u.priority).toBe(2);
  expect(u.createdAt).toBe(960); // 1000 - 40 ms worklet time
  expect(metrics.get(u.id)!.stages).toEqual({ frame_ts: 0, detect_done: 40, enqueued: 40 });
});

test('filters run before tracking: low score, tiny boxes and non-alert classes are ignored', () => {
  const { lane, enqueued, frame } = setup();
  lane.handle(
    frame([
      { label: 'chair', score: 0.39, box: [0.4, 0.3, 0.6, 0.6] },
      { label: 'chair', score: 0.9, box: [0.4, 0.3, 0.45, 0.35] },
      { label: 'laptop', score: 0.9, box: [0.4, 0.3, 0.6, 0.6] },
    ]),
  );
  expect(enqueued).toHaveLength(0);
  expect(lane.visible).toHaveLength(0);
});

test('alerts from one frame share a frameId, vehicle first and P0', () => {
  const { lane, enqueued, frame } = setup();
  lane.handle(frame([chair, car], 7));
  expect(enqueued.map((u) => [u.frameId, u.priority, u.parts[0]])).toEqual([
    [7, 0, { kind: 'clip', key: 'obj.car' }],
    [7, 2, { kind: 'clip', key: 'obj.chair' }],
  ]);
});

test('quiet mode mutes far non-vehicles', () => {
  const { lane, enqueued, frame } = setup();
  lane.quiet = true;
  lane.handle(frame([chair, car]));
  expect(enqueued.map((u) => u.parts[0])).toEqual([{ kind: 'clip', key: 'obj.car' }]);
});

test('stats track frames per second and the last timings; listeners are told', () => {
  const { lane, frame, advance } = setup();
  const cb = jest.fn();
  lane.onUpdate(cb);
  for (let i = 0; i < 11; i++) {
    lane.handle(frame([], i));
    advance(100);
  }
  expect(lane.stats.frames).toBe(11);
  expect(lane.stats.detectionsPerSec).toBeCloseTo(10, 0);
  expect(lane.stats.lastInferMs).toBe(25);
  expect(cb).toHaveBeenCalledTimes(11);
  expect(lane.frameSize).toEqual({ width: 480, height: 640 });
});

test('faces go to the face sink with the visible tracks, after the alerts; face stats update', () => {
  const { lane, enqueued, frame } = setup();
  const person: Detection = { label: 'person', score: 0.9, box: [0.3, 0.1, 0.7, 0.9] };
  const calls: { n: number; tracks: string[]; frameId: number; frameTs: number; alertsBefore: number }[] = [];
  lane.faces = {
    update: (faces, visible, f) =>
      calls.push({ n: faces.length, tracks: visible.map((t) => t.label), ...f, alertsBefore: enqueued.length }),
  };
  const face = { box: [0.45, 0.15, 0.55, 0.25] as [number, number, number, number], widthPx: 100, embedding: null };
  lane.handle({ ...frame([person]), faces: [face], faceMs: 18 });
  expect(calls).toEqual([{ n: 1, tracks: ['person'], frameId: 1, frameTs: 960, alertsBefore: 1 }]);
  expect(lane.stats.lastFaceMs).toBe(18);
  expect(lane.stats.faces).toBe(1);
  lane.handle({ ...frame([person], 2), faceMs: -1 }); // face step skipped: stats keep the last run
  expect(calls[1].n).toBe(0);
  expect(lane.stats.lastFaceMs).toBe(18);
});

test('a dark frame stream for 2 s → "Camera saaf nahi dikh raha" at P1, repeated every 20 s', () => {
  const { lane, enqueued, frame, advance } = setup();
  for (let i = 0; i < 25; i++) {
    lane.handle({ ...frame([], i + 1), luma: 0.01 });
    advance(100);
  }
  const warns = enqueued.filter((u) => u.parts[0].kind === 'clip' && u.parts[0].key === 'sys.camera_blocked');
  expect(warns).toHaveLength(1);
  expect(warns[0]).toMatchObject({ priority: 1, source: 'system' });
  lane.handle({ ...frame([], 99), luma: 0.6 });
  expect(lane.blocked.blocked).toBe(false);
});
