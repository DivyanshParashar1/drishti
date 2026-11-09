import { buildAlertUtterances, passesQuietMode, rank, schedulerPriority } from '../alerts';
import type { Alert, Track } from '../tracker';

const track = (label: string, dir: 'left' | 'ahead' | 'right' = 'ahead'): Track => ({
  id: 1, label, score: 0.9, box: [0, 0, 1, 1], dir, firstSeen: 0, lastSeen: 0, announced: true,
});
const alert = (label: string, dir?: 'left' | 'ahead' | 'right'): Alert => ({ track: track(label, dir), reason: 'new' });

test('order: vehicles, people, animals, everything else', () => {
  const sorted = ['bottle', 'person', 'dog', 'bench', 'bicycle'].sort((a, b) => rank(a) - rank(b));
  expect(sorted).toEqual(['bicycle', 'person', 'dog', 'bottle', 'bench']);
});

test('scheduler priority: vehicles are P0, everything else P2', () => {
  expect(schedulerPriority('truck')).toBe(0);
  expect(schedulerPriority('chair')).toBe(2);
  expect(schedulerPriority('person')).toBe(2);
  expect(schedulerPriority('bottle')).toBe(2);
});

test('quiet mode keeps vehicles only', () => {
  expect(passesQuietMode('person', true)).toBe(false);
  expect(passesQuietMode('motorcycle', true)).toBe(true);
  expect(passesQuietMode('person', false)).toBe(true);
});

test('utterances: just the object name, vehicles first, sharing the frame', () => {
  let n = 0;
  const us = buildAlertUtterances(
    [alert('chair', 'right'), alert('bottle', 'left'), alert('car', 'left')],
    { frameId: 42, frameTs: 1234 },
    'hi-en',
    { quiet: false, newId: () => `r${++n}` },
  );
  expect(us.map((u) => u.parts)).toEqual([
    [{ kind: 'clip', key: 'obj.car' }],
    [{ kind: 'clip', key: 'obj.chair' }],
    [{ kind: 'clip', key: 'obj.bottle' }],
  ]);
  expect(us.map((u) => u.priority)).toEqual([0, 2, 2]);
  expect(us.every((u) => u.frameId === 42 && u.createdAt === 1234 && u.source === 'reflex')).toBe(true);
  expect(us.map((u) => u.id)).toEqual(['r1', 'r2', 'r3']);
});

test('every YOLO class has a clip key, so any object can be announced', () => {
  const us = buildAlertUtterances([alert('cell phone'), alert('teddy bear')], { frameId: 1, frameTs: 0 }, 'en', { quiet: false, newId: () => 'x' });
  expect(us.map((u) => u.parts[0])).toEqual([
    { kind: 'clip', key: 'obj.cell_phone' },
    { kind: 'clip', key: 'obj.teddy_bear' },
  ]);
});

test('quiet mode drops non-vehicles from the utterances', () => {
  const us = buildAlertUtterances([alert('person'), alert('bus')], { frameId: 1, frameTs: 0 }, 'en', { quiet: true, newId: () => 'x' });
  expect(us).toHaveLength(1);
  expect(us[0].parts[0]).toEqual({ kind: 'clip', key: 'obj.bus' });
});
