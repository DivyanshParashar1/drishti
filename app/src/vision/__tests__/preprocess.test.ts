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
