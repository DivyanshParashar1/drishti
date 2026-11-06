import { area, direction, distance, filterDetections } from '../geometry';
import type { Box } from '../types';

const boxAt = (cx: number, w = 0.1, y1 = 0.3, y2 = 0.5): Box => [cx - w / 2, y1, cx + w / 2, y2];

test.each([
  [0.1, 'left'],
  [0.32, 'left'],
  [0.34, 'ahead'],
  [0.5, 'ahead'],
  [0.66, 'ahead'],
  [0.68, 'right'],
  [0.95, 'right'],
] as const)('centre %f → %s', (cx, dir) => {
  expect(direction(boxAt(cx))).toBe(dir);
});

test('hysteresis keeps the previous direction near a third-line', () => {
  expect(direction(boxAt(0.35), 'left')).toBe('left'); // just past the line: stays left
  expect(direction(boxAt(0.38), 'left')).toBe('ahead'); // clearly past: switches
  expect(direction(boxAt(0.31), 'ahead')).toBe('ahead');
  expect(direction(boxAt(0.28), 'ahead')).toBe('left');
  expect(direction(boxAt(0.64), 'right')).toBe('right');
});

test.each([
  ['tall box', [0.4, 0.2, 0.6, 0.7], 'near'],
  ['exactly 45% tall is far', [0.4, 0.3, 0.6, 0.75], 'far'],
  ['bottom in lowest 15%', [0.4, 0.8, 0.6, 0.9], 'near'],
  ['small, high up', [0.4, 0.2, 0.5, 0.4], 'far'],
] as const)('%s → %s', (_, box, d) => {
  expect(distance(box as unknown as Box)).toBe(d);
});

test('filters: alert classes, score ≥ 0.5, area ≥ 3%', () => {
  const big: Box = [0, 0, 0.3, 0.3]; // 9%
  const tiny: Box = [0, 0, 0.1, 0.1]; // 1%
  const dets = [
    { label: 'chair', score: 0.6, box: big },
    { label: 'chair', score: 0.49, box: big },
    { label: 'chair', score: 0.9, box: tiny },
    { label: 'laptop', score: 0.9, box: big },
    { label: 'dining table', score: 0.5, box: big },
  ];
  expect(filterDetections(dets).map((d) => `${d.label}:${d.score}`)).toEqual(['chair:0.6', 'dining table:0.5']);
  expect(area([0.2, 0.2, 0.1, 0.1])).toBe(0);
});
