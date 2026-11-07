import { CameraBlockedMonitor } from '../cameraBlocked';
import { meanLuma } from '../preprocess';

const run = (m: CameraBlockedMonitor, luma: number, from: number, to: number, every = 100) => {
  const warns: number[] = [];
  for (let t = from; t <= to; t += every) if (m.update(luma, t)) warns.push(t);
  return warns;
};

test('dark for 2 s → warn, then every 20 s while it lasts', () => {
  const m = new CameraBlockedMonitor();
  expect(run(m, 0.02, 0, 1900)).toEqual([]);
  expect(run(m, 0.02, 2000, 45_000)).toEqual([2000, 22_000, 42_000]);
  expect(m.blocked).toBe(true);
});

test('light again clears it; a new dark spell waits 2 s again', () => {
  const m = new CameraBlockedMonitor();
  run(m, 0.02, 0, 3000);
  expect(run(m, 0.5, 3100, 3100)).toEqual([]);
  expect(m.blocked).toBe(false);
  expect(run(m, 0.02, 3200, 5100)).toEqual([]);
  expect(run(m, 0.02, 5200, 5200)).toEqual([5200]);
});

test('short dark moments (< 2 s) never warn', () => {
  const m = new CameraBlockedMonitor();
  for (let k = 0; k < 10; k++) {
    expect(run(m, 0.02, k * 3000, k * 3000 + 1500)).toEqual([]);
    run(m, 0.5, k * 3000 + 1600, k * 3000 + 2900);
  }
});

test('hysteresis: flicker just above the threshold while blocked does not reset the repeat timer', () => {
  const m = new CameraBlockedMonitor();
  run(m, 0.02, 0, 2000); // warned at 2000
  expect(run(m, 0.09, 2100, 10_000)).toEqual([]); // 0.09 < 0.08 + 0.04: still blocked, no new warning yet
  expect(m.blocked).toBe(true);
  expect(run(m, 0.02, 10_100, 22_000)).toEqual([22_000]);
});

test('meanLuma: black, white and grey frames, padded rows, BGRA', () => {
  const size = 16;
  const make = (v: number, pad = 0, bpp = 4) => {
    const stride = size * bpp + pad;
    const px = new Uint8Array(stride * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size * bpp; x++) px[y * stride + x] = v;
    return px;
  };
  expect(meanLuma(make(0), 'RGBA', size, 4)).toBe(0);
  expect(meanLuma(make(255, 12), 'RGBA', size, 4)).toBeCloseTo(1, 6);
  expect(meanLuma(make(128, 0, 3), 'RGB', size, 4)).toBeCloseTo(128 / 255, 6);
  expect(meanLuma(make(51), 'BGRA', size)).toBeCloseTo(0.2, 6);
  expect(meanLuma(make(0), 'NV21' as string, size)).toBe(1); // unknown format: never "dark"
});
