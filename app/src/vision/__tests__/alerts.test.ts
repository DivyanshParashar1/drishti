import { buildAlertUtterances, passesQuietMode, rank, schedulerPriority } from '../alerts';
import type { Alert, Track } from '../tracker';

const track = (label: string, dist: 'near' | 'far', dir: 'left' | 'ahead' | 'right' = 'ahead'): Track => ({
  id: 1, label, score: 0.9, box: [0, 0, 1, 1], dir, dist, firstSeen: 0, lastSeen: 0, announced: null,
});
const alert = (label: string, dist: 'near' | 'far', dir?: 'left' | 'ahead' | 'right'): Alert => ({
  track: track(label, dist, dir),
  reason: 'new',
});

test('F1 priority order', () => {
  const order = [
    ['bench', 'far'],
    ['person', 'far'],
    ['dog', 'far'],
    ['chair', 'near'],
    ['bicycle', 'far'],
  ] as const;
  const sorted = [...order].sort((a, b) => rank(a[0], a[1]) - rank(b[0], b[1]));
  expect(sorted.map((x) => x[0])).toEqual(['bicycle', 'chair', 'dog', 'person', 'bench']);
  expect(rank('person', 'near')).toBe(1);
  expect(rank('car', 'far')).toBe(0);
});

test('scheduler priority: vehicles and near hazards are P0, others P2', () => {
  expect(schedulerPriority('truck', 'far')).toBe(0);
  expect(schedulerPriority('chair', 'near')).toBe(0);
  expect(schedulerPriority('cow', 'far')).toBe(2);
  expect(schedulerPriority('person', 'far')).toBe(2);
});

test('quiet mode keeps vehicles and near objects only', () => {
  expect(passesQuietMode('person', 'far', true)).toBe(false);
  expect(passesQuietMode('person', 'near', true)).toBe(true);
  expect(passesQuietMode('motorcycle', 'far', true)).toBe(true);
  expect(passesQuietMode('person', 'far', false)).toBe(true);
});

test('utterances: [obj][dir][dist], most urgent first, sharing the frame', () => {
  let n = 0;
  const us = buildAlertUtterances(
    [alert('chair', 'far', 'right'), alert('dining table', 'near', 'left'), alert('car', 'far', 'left')],
    { frameId: 42, frameTs: 1234 },
    'hi-en',
    { quiet: false, newId: () => `r${++n}` },
  );
  expect(us.map((u) => u.parts.map((p) => (p.kind === 'clip' ? p.key : '')).join(' '))).toEqual([
    'obj.car dir.left dist.far',
    'obj.dining_table dir.left dist.near',
    'obj.chair dir.right dist.far',
  ]);
  expect(us.map((u) => u.priority)).toEqual([0, 0, 2]);
  expect(us.every((u) => u.frameId === 42 && u.createdAt === 1234 && u.source === 'reflex')).toBe(true);
  expect(us.map((u) => u.id)).toEqual(['r1', 'r2', 'r3']);
});

test('quiet mode drops far non-vehicles from the utterances', () => {
  const us = buildAlertUtterances([alert('person', 'far'), alert('bus', 'far')], { frameId: 1, frameTs: 0 }, 'en', {
    quiet: true,
    newId: () => 'x',
  });
  expect(us).toHaveLength(1);
  expect(us[0].parts[0]).toEqual({ kind: 'clip', key: 'obj.bus' });
});
