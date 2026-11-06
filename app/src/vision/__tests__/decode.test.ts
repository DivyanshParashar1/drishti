import autos from '../__fixtures__/autos.json';
import busNumber from '../__fixtures__/bus_number.json';
import footpath from '../__fixtures__/footpath.json';
import { decodeEfficientDet, decodeYolo, iou } from '../decode';
import type { Detection } from '../types';

interface Fixture {
  efficientdet: { boxes: number[]; classes: number[]; scores: number[]; count: number[] };
  yolo: { n: number; data: number[] };
  expected: { efficientdet: Detection[]; yolo: Detection[] };
}
const fixtures: [string, Fixture][] = [
  ['bus_number', busNumber as unknown as Fixture],
  ['autos', autos as unknown as Fixture],
  ['footpath', footpath as unknown as Fixture],
];

const near = (a: Detection[], b: Detection[]) => {
  expect(a.map((d) => d.label)).toEqual(b.map((d) => d.label));
  a.forEach((d, i) => {
    expect(d.score).toBeCloseTo(b[i].score, 3);
    d.box.forEach((v, k) => expect(v).toBeCloseTo(b[i].box[k], 3));
  });
};

describe.each(fixtures)('%s', (_, fx) => {
  test('EfficientDet decode matches the reference', () => {
    const e = fx.efficientdet;
    near(decodeEfficientDet([e.boxes, e.classes, e.scores, e.count], 0.25), fx.expected.efficientdet);
  });

  test('YOLO decode + NMS matches the reference', () => {
    near(decodeYolo(Float32Array.from(fx.yolo.data), fx.yolo.n, 0.25), fx.expected.yolo);
  });
});

test('bus image: both models find the bus in the right place', () => {
  const fx = busNumber as unknown as Fixture;
  const e = fx.efficientdet;
  const eff = decodeEfficientDet([e.boxes, e.classes, e.scores, e.count], 0.5);
  const yolo = decodeYolo(Float32Array.from(fx.yolo.data), fx.yolo.n, 0.5);
  const bus = (ds: Detection[]) => ds.find((d) => d.label === 'bus')!;
  expect(bus(eff).score).toBeGreaterThan(0.85);
  expect(bus(yolo).score).toBeGreaterThan(0.9);
  expect(iou(bus(eff).box, bus(yolo).box)).toBeGreaterThan(0.8);
});

test('YOLO NMS suppresses overlapping boxes of a class but not across classes', () => {
  const n = 3;
  const data = new Float32Array(84 * n);
  const set = (j: number, cx: number, cls: number, s: number) => {
    data[j] = cx;
    data[n + j] = 0.5;
    data[2 * n + j] = 0.2;
    data[3 * n + j] = 0.2;
    data[(4 + cls) * n + j] = s;
  };
  set(0, 0.5, 2, 0.9); // car
  set(1, 0.51, 2, 0.8); // same car, overlapping
  set(2, 0.5, 0, 0.7); // person, same place
  expect(decodeYolo(data, n, 0.5).map((d) => `${d.label}:${d.score.toFixed(1)}`)).toEqual(['car:0.9', 'person:0.7']);
});

test('YOLO allowed-class filter skips other classes', () => {
  const n = 1;
  const data = new Float32Array(84);
  data[0] = 0.5; data[1] = 0.5; data[2] = 0.2; data[3] = 0.2;
  data[4 + 63] = 0.9; // laptop (YOLO 80-class index)
  data[4 + 56] = 0.6; // chair
  expect(decodeYolo(data, n, 0.5, 0.45, 20, new Set([56]))[0].label).toBe('chair');
});

test('EfficientDet clamps boxes and ignores entries past count', () => {
  const d = decodeEfficientDet([[-0.1, 0.2, 1.2, 0.4, 0, 0, 1, 1], [61, 0], [0.9, 0.95], [1]], 0.5);
  expect(d).toEqual([{ label: 'chair', score: 0.9, box: [0.2, 0, 0.4, 1] }]);
});
