import { area, direction, filterDetections } from '../geometry';
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

test('filters: any YOLO class, score ≥ 0.4, area ≥ 0.5%', () => {
  const big: Box = [0, 0, 0.3, 0.3]; // 9%
  const small: Box = [0, 0, 0.1, 0.1]; // 1%: a bottle on a table
  const tiny: Box = [0, 0, 0.05, 0.05]; // 0.25%
  const dets = [
    { label: 'chair', score: 0.6, box: big },
    { label: 'chair', score: 0.39, box: big },
    { label: 'bottle', score: 0.5, box: small },
    { label: 'cup', score: 0.9, box: tiny },
    { label: 'laptop', score: 0.9, box: big },
    { label: '???', score: 0.9, box: big },
  ];
  expect(filterDetections(dets).map((d) => `${d.label}:${d.score}`)).toEqual(['chair:0.6', 'bottle:0.5', 'laptop:0.9']);
  expect(area([0.2, 0.2, 0.1, 0.1])).toBe(0);
});
