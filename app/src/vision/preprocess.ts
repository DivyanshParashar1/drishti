import type { DetectorId } from './config';

/** Where R, G, B sit in each pixel, and bytes per pixel, for nitro-image's raw pixel formats. */
export const PIXEL_LAYOUT: Record<string, { r: number; g: number; b: number; bpp: number }> = {
  RGBA: { r: 0, g: 1, b: 2, bpp: 4 },
  RGBX: { r: 0, g: 1, b: 2, bpp: 4 },
  BGRA: { r: 2, g: 1, b: 0, bpp: 4 },
  BGRX: { r: 2, g: 1, b: 0, bpp: 4 },
  ARGB: { r: 1, g: 2, b: 3, bpp: 4 },
  XRGB: { r: 1, g: 2, b: 3, bpp: 4 },
  ABGR: { r: 3, g: 2, b: 1, bpp: 4 },
  XBGR: { r: 3, g: 2, b: 1, bpp: 4 },
  RGB: { r: 0, g: 1, b: 2, bpp: 3 },
  BGR: { r: 2, g: 1, b: 0, bpp: 3 },
};

export const supportedPixelFormat = (f: string) => f in PIXEL_LAYOUT;

/**
 * Raw pixels (already resized to size×size) → the detector's input tensor.
 * - EfficientDet-Lite0: uint8 [1, size, size, 3], RGB interleaved (NHWC).
 * - YOLO11n: float32 [1, 3, size, size], planar RGB scaled to 0–1 (NCHW).
 * Rows may be padded: the stride is derived from the buffer length.
 */
export function toInputTensor(
  pixels: Uint8Array,
  format: string,
  size: number,
  detector: DetectorId,
): ArrayBuffer {
  'worklet';
  const L = PIXEL_LAYOUT[format];
  if (!L) throw new Error(`unsupported pixel format ${format}`);
  const stride = Math.floor(pixels.length / size);
  const n = size * size;
  if (detector === 'efficientdet_lite0') {
    const out = new Uint8Array(n * 3);
    for (let y = 0; y < size; y++) {
      const row = y * stride;
      for (let x = 0; x < size; x++) {
        const s = row + x * L.bpp;
        const d = (y * size + x) * 3;
        out[d] = pixels[s + L.r];
        out[d + 1] = pixels[s + L.g];
        out[d + 2] = pixels[s + L.b];
      }
    }
    return out.buffer;
  }
  const out = new Float32Array(n * 3);
  const k = 1 / 255;
  for (let y = 0; y < size; y++) {
    const row = y * stride;
    for (let x = 0; x < size; x++) {
      const s = row + x * L.bpp;
      const i = y * size + x;
      out[i] = pixels[s + L.r] * k;
      out[n + i] = pixels[s + L.g] * k;
      out[2 * n + i] = pixels[s + L.b] * k;
    }
  }
  return out.buffer;
}
