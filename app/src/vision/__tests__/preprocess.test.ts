import { supportedPixelFormat, toInputTensor } from '../preprocess';

// 2×2 image: red, green / blue, white
const RGBA = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
const BGRA = Uint8Array.from([0, 0, 255, 255, 0, 255, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255]);

test('EfficientDet input is uint8 RGB interleaved', () => {
  const want = [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255];
  expect([...new Uint8Array(toInputTensor(RGBA, 'RGBA', 2, 'efficientdet_lite0'))]).toEqual(want);
  expect([...new Uint8Array(toInputTensor(BGRA, 'BGRA', 2, 'efficientdet_lite0'))]).toEqual(want);
});

test('YOLO input is float32 planar RGB in 0–1', () => {
  const out = [...new Float32Array(toInputTensor(RGBA, 'RGBA', 2, 'yolo11n'))];
  expect(out).toEqual([1, 0, 0, 1, /* G */ 0, 1, 0, 1, /* B */ 0, 0, 1, 1]);
});

test('padded rows are handled via the stride', () => {
  // 2×2 RGB with 2 bytes of row padding (stride 8)
  const rgb = Uint8Array.from([1, 2, 3, 4, 5, 6, 0, 0, 7, 8, 9, 10, 11, 12, 0, 0]);
  expect([...new Uint8Array(toInputTensor(rgb, 'RGB', 2, 'efficientdet_lite0'))]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('unsupported formats are rejected', () => {
  expect(supportedPixelFormat('unknown')).toBe(false);
  expect(() => toInputTensor(RGBA, 'unknown', 2, 'yolo11n')).toThrow('unsupported');
});

describe('letterbox (YOLO)', () => {
  const { letterbox, toLetterboxTensor, unletterbox } = jest.requireActual('../preprocess') as typeof import('../preprocess');
  test('portrait 720×1280 → 180×320 centred with 70 px bars left and right', () => {
    expect(letterbox(720, 1280, 320)).toEqual({ size: 320, w: 180, h: 320, padX: 70, padY: 0 });
    expect(letterbox(1280, 720, 320)).toEqual({ size: 320, w: 320, h: 180, padX: 0, padY: 70 });
  });
  test('image pixels land inside the bars; the bars are grey 114', () => {
    const lb = { size: 8, w: 4, h: 8, padX: 2, padY: 0 };
    const px = new Uint8Array(4 * 8 * 4).fill(255);
    const t = new Float32Array(toLetterboxTensor(px, 'RGBA', lb));
    expect(t[0]).toBeCloseTo(114 / 255); // (0,0) is a bar
    expect(t[2]).toBeCloseTo(1); // (2,0) is image
    expect(t[5]).toBeCloseTo(1);
    expect(t[6]).toBeCloseTo(114 / 255);
    expect(t[64 + 7 * 8 + 3]).toBeCloseTo(1); // green plane
  });
  test('unletterbox inverts the mapping and clamps boxes that spill into the bars', () => {
    const lb = { size: 320, w: 180, h: 320, padX: 70, padY: 0 };
    const b = unletterbox([(70 + 45) / 320, 0.25, (70 + 135) / 320, 0.75], lb);
    expect(b[0]).toBeCloseTo(0.25);
    expect(b[2]).toBeCloseTo(0.75);
    expect(b[1]).toBeCloseTo(0.25);
    expect(unletterbox([0, 0, 1, 1], lb)).toEqual([0, 0, 1, 1]);
  });
});
