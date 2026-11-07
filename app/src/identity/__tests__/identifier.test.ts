import type { SchedulerHooks, Utterance } from '../../audio/scheduler';
import { Metrics } from '../../core/metrics';
import type { Track } from '../../vision/tracker';
import type { Box } from '../../vision/types';
import { IDENTITY } from '../config';
import { FaceIdentifier, nameParts, type FaceObs, type NamedPerson } from '../identifier';
import { BASIS, withSim } from '../__fixtures__/embeddings';

const rahul: NamedPerson = { id: 1, name: 'Rahul', embeddings: [BASIS[0]] };
const priya: NamedPerson = { id: 2, name: 'Priya', embeddings: [BASIS[1]], clips: { 'hi-en': 'file:///priya.mp3' } };

function setup(people: NamedPerson[] = [rahul, priya]) {
  const enqueued: Utterance[] = [];
  const hooks: SchedulerHooks[] = [];
  const scheduler = {
    enqueue: (u: Utterance) => void enqueued.push(u),
    subscribe: (h: SchedulerHooks) => {
      hooks.push(h);
      return () => {};
    },
  };
  const list = [...people];
  const id = new FaceIdentifier({ scheduler, metrics: new Metrics(), lang: () => 'hi-en', people: () => list }, IDENTITY);
  let frame = 0;
  const step = (faces: FaceObs[], tracks: Track[], now: number) => id.update(faces, tracks, { frameId: ++frame, frameTs: now }, now);
  return { id, enqueued, hooks, step, list };
}

function track(id: number, box: Box = [0.2, 0.1, 0.8, 0.95], dir: Track['dir'] = 'ahead'): Track {
  return { id, label: 'person', score: 0.9, box, dir, dist: 'far', firstSeen: 0, lastSeen: 0, announced: null };
}

const face = (embedding: number[] | null, box: Box = [0.4, 0.15, 0.6, 0.3], widthPx = 120): FaceObs => ({ box, widthPx, embedding });
const like = (base: number[], k = 8) => withSim(base, 0.8, k); // a good match (cos 0.8)
const stranger = BASIS[7];

test('a known person is named after 3 of the last 5 frames and announced once, [name] + [dir] at P1', () => {
  const { enqueued, step, id } = setup();
  const t = track(5, undefined, 'left');
  step([face(like(BASIS[0]))], [t], 0);
  step([face(stranger)], [t], 100);
  step([face(like(BASIS[0]))], [t], 200);
  expect(enqueued).toHaveLength(0); // 2 votes so far
  expect(id.decisionOf(5)?.label).toBe('3/5');
  step([face(like(BASIS[0]))], [t], 300);
  expect(enqueued).toHaveLength(1);
  expect(enqueued[0].priority).toBe(1);
  expect(enqueued[0].parts).toEqual([
    { kind: 'speak', text: 'Rahul aapke saamne hai' },
    { kind: 'clip', key: 'dir.left' },
  ]);
  expect(id.decisionOf(5)?.label).toBe('Rahul');
  for (let i = 4; i < 20; i++) step([face(like(BASIS[0]))], [t], i * 100);
  step([], [t], 2500); // no face this frame: still present, still not re-announced
  expect(enqueued).toHaveLength(1);
  expect(id.presentPeople().map((p) => [p.person.name, p.dir])).toEqual([['Rahul', 'left']]);
});

test('the name clip file is used when one exists for the language', () => {
  expect(nameParts(priya, 'hi-en', 'right')[0]).toEqual({ kind: 'file', uri: 'file:///priya.mp3', text: 'Priya aapke saamne hai' });
  expect(nameParts(priya, 'en', 'right')[0]).toEqual({ kind: 'speak', text: 'Priya is here' });
});

test('an unenrolled person → "unknown" after 5 frames with no match, never named', () => {
  const { enqueued, step, id } = setup();
  const t = track(9);
  for (let i = 0; i < 4; i++) step([face(withSim(stranger, 0.9, 9 + i))], [t], i * 100);
  expect(enqueued).toHaveLength(0);
  step([face(stranger)], [t], 400);
  expect(enqueued.map((u) => u.parts)).toEqual([[{ kind: 'clip', key: 'sys.unknown_person' }]]);
  expect(id.decisionOf(9)?.label).toBe('unknown');
  for (let i = 5; i < 30; i++) step([face(stranger)], [t], i * 100);
  expect(enqueued).toHaveLength(1); // once per track
  expect(id.presentPeople()).toEqual([]);
});

test('a near-threshold face votes no match; two lookalikes resolve to unknown', () => {
  const twinA: NamedPerson = { id: 3, name: 'Twin A', embeddings: [BASIS[3]] };
  const twinB: NamedPerson = { id: 4, name: 'Twin B', embeddings: [withSim(BASIS[3], 0.9, 15)] };
  const { enqueued, step } = setup([twinA, twinB]);
  const t = track(1);
  for (let i = 0; i < 5; i++) step([face(withSim(BASIS[3], 0.95, 15))], [t], i * 100);
  expect(enqueued.map((u) => u.parts[0])).toEqual([{ kind: 'clip', key: 'sys.unknown_person' }]);

  const near = setup([rahul]);
  for (let i = 0; i < 5; i++) near.step([face(withSim(BASIS[0], 0.49, 9))], [track(2)], i * 100);
  expect(near.enqueued.map((u) => u.parts[0])).toEqual([{ kind: 'clip', key: 'sys.unknown_person' }]);
});

test('unknown → name is allowed (face turned toward the camera); a name never flips to another name', () => {
  const { enqueued, step, id } = setup();
  const t = track(3);
  for (let i = 0; i < 5; i++) step([face(stranger)], [t], i * 100);
  for (let i = 5; i < 8; i++) step([face(like(BASIS[1]))], [t], i * 100);
  expect(id.decisionOf(3)?.label).toBe('Priya');
  for (let i = 8; i < 14; i++) step([face(like(BASIS[0]))], [t], i * 100);
  expect(id.decisionOf(3)?.label).toBe('Priya');
  expect(enqueued.map((u) => u.parts[0])).toEqual([
    { kind: 'clip', key: 'sys.unknown_person' },
    { kind: 'file', uri: 'file:///priya.mp3', text: 'Priya aapke saamne hai' },
  ]);
});

test('"unknown person" at most once per 30 s across tracks', () => {
  const { enqueued, step } = setup();
  for (let i = 0; i < 5; i++) step([face(stranger)], [track(1)], i * 100);
  for (let i = 0; i < 5; i++) step([face(stranger)], [track(2)], 1000 + i * 100);
  expect(enqueued).toHaveLength(1);
  for (let i = 0; i < 5; i++) step([face(stranger)], [track(3)], 31_000 + i * 100);
  expect(enqueued).toHaveLength(2);
});

test('small faces, faces without embeddings and faces outside every person box are ignored', () => {
  const { step, id } = setup();
  const t = track(1, [0.0, 0.0, 0.3, 0.5]);
  for (let i = 0; i < 5; i++) {
    step([face(like(BASIS[0]), [0.1, 0.1, 0.2, 0.2], 79)], [t], i * 100); // < 80 px
    step([face(null, [0.1, 0.1, 0.2, 0.2], 200)], [t], i * 100 + 10);
    step([face(like(BASIS[0]), [0.6, 0.6, 0.7, 0.7], 200)], [t], i * 100 + 20); // centre outside
  }
  expect(id.decisionOf(1)).toBeNull();
  expect(id.log).toHaveLength(0);
});

test('faces go to the smallest containing person box, one face per track, biggest face first', () => {
  const { step, id } = setup();
  const big = track(1, [0.0, 0.0, 1.0, 1.0]);
  const small = track(2, [0.4, 0.1, 0.7, 0.9]);
  for (let i = 0; i < 3; i++) {
    step(
      [
        face(like(BASIS[1]), [0.5, 0.2, 0.6, 0.3], 150), // inside both → small box
        face(like(BASIS[0]), [0.45, 0.25, 0.55, 0.35], 100), // inside both, small taken → big box
      ],
      [big, small],
      i * 100,
    );
  }
  expect(id.decisionOf(2)?.label).toBe('Priya');
  expect(id.decisionOf(1)?.label).toBe('Rahul');
});

test('re-announce only after > 5 min absent; a track coming back sooner is not re-announced', () => {
  const { enqueued, hooks, step } = setup();
  const name3 = (tid: number, t0: number) => {
    for (let i = 0; i < 3; i++) step([face(like(BASIS[0]))], [track(tid)], t0 + i * 100);
  };
  name3(1, 0);
  expect(enqueued).toHaveLength(1);
  hooks.forEach((h) => h.onEnd?.(enqueued[0], 'done'));
  step([], [], 1000); // gone (track dropped)
  name3(2, 60_000); // back after 1 min as a new track
  expect(enqueued).toHaveLength(1);
  step([], [], 61_000);
  name3(3, 60_200 + 5 * 60_000 + 1); // back after > 5 min
  expect(enqueued).toHaveLength(2);
});

test('a dropped (stale) or interrupted announcement is retried while the person is in view; done is final', () => {
  const { enqueued, hooks, step } = setup();
  const t = track(1);
  for (let i = 0; i < 3; i++) step([face(like(BASIS[0]))], [t], i * 100);
  expect(enqueued).toHaveLength(1);
  step([], [t], 300); // pending: nothing new
  expect(enqueued).toHaveLength(1);
  hooks.forEach((h) => h.onDrop?.(enqueued[0], 'stale'));
  step([], [t], 400);
  expect(enqueued).toHaveLength(2);
  hooks.forEach((h) => h.onEnd?.(enqueued[1], 'interrupted'));
  step([], [t], 500);
  expect(enqueued).toHaveLength(3);
  hooks.forEach((h) => h.onEnd?.(enqueued[2], 'done'));
  step([], [t], 600);
  expect(enqueued).toHaveLength(3);
});

test('an announcement the user stopped ("ruko") or cleared is not retried', () => {
  const { enqueued, hooks, step } = setup([rahul, priya]);
  const a = track(1, [0.0, 0.0, 0.5, 1.0]);
  const b = track(2, [0.5, 0.0, 1.0, 1.0]);
  for (let i = 0; i < 3; i++)
    step([face(like(BASIS[0]), [0.2, 0.1, 0.3, 0.2]), face(like(BASIS[1]), [0.7, 0.1, 0.8, 0.2])], [a, b], i * 100);
  expect(enqueued).toHaveLength(2);
  hooks.forEach((h) => h.onEnd?.(enqueued[0], 'stopped'));
  hooks.forEach((h) => h.onDrop?.(enqueued[1], 'cleared'));
  step([], [a, b], 400);
  expect(enqueued).toHaveLength(2);
});

test('a person deleted while in view stops being present; the DT-8.1 log records similarities', () => {
  const { step, id, list } = setup();
  const t = track(1);
  for (let i = 0; i < 3; i++) step([face(like(BASIS[0]))], [t], i * 100);
  expect(id.presentPeople()).toHaveLength(1);
  list.splice(0, 1); // Rahul deleted
  step([], [t], 400);
  expect(id.presentPeople()).toHaveLength(0);
  expect(id.log[0]).toMatchObject({ track: 1, widthPx: 120, best: 'Rahul', named: 'Rahul' });
  expect(id.log[0].sim).toBeCloseTo(0.8, 6);
});

test('captureFaces: frames with exactly one embeddable face ≥ minPx; two faces skipped; stops at max', async () => {
  const { id, step } = setup();
  const p = id.captureFaces({ max: 2, durationMs: 3000, minPx: 100 });
  step([face(like(BASIS[0]), undefined, 99)], [], 0); // embeddable but < 100 px
  step([face(like(BASIS[0]), undefined, 150), face(like(BASIS[1]), undefined, 90)], [], 100); // two faces
  step([face(like(BASIS[0]), undefined, 150), face(null, undefined, 40)], [], 200); // tiny bystander is fine
  step([face(like(BASIS[0], 9), undefined, 120)], [], 300);
  const r = await p;
  expect(r.embeddings).toEqual([like(BASIS[0]), like(BASIS[0], 9)]);
  expect(r.multiFaceFrames).toBe(1);
});

test('captureFaces keeps frames at least minGapMs apart', async () => {
  const { id, step } = setup();
  const p = id.captureFaces({ max: 3, durationMs: 3000, minPx: 100, minGapMs: 300 });
  for (let t = 0; t <= 700; t += 100) step([face(like(BASIS[0]), undefined, 150)], [], t);
  // captured at 0, 300, 600
  expect((await p).embeddings).toHaveLength(3);
});

test('captureFaces resolves with what it has when the time is up', async () => {
  jest.useFakeTimers();
  try {
    const { id, step } = setup();
    const p = id.captureFaces({ max: 10, durationMs: 3000, minPx: 100 });
    step([face(like(BASIS[0]), undefined, 150)], [], 0);
    jest.advanceTimersByTime(3001);
    expect((await p).embeddings).toHaveLength(1);
  } finally {
    jest.useRealTimers();
  }
});

test('suppressUnknown keeps "unknown person" quiet while enrolling', () => {
  const { id, enqueued, step } = setup();
  id.suppressUnknown = true;
  for (let i = 0; i < 6; i++) step([face(stranger)], [track(1)], i * 100);
  expect(enqueued).toHaveLength(0);
  id.suppressUnknown = false; // saved now: the same track is not called unknown afterwards
  for (let i = 6; i < 9; i++) step([face(stranger)], [track(1)], i * 100);
  expect(enqueued).toHaveLength(0);
});
