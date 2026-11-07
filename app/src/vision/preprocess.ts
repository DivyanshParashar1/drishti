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

/**
 * Mean luminance (Rec. 601, 0–1) of width×height raw pixels, sampling every `step`th pixel in each
 * direction. For the dark / blocked camera warning (F10).
 */
export function meanLuma(pixels: Uint8Array, format: string, width: number, height = width, step = 8): number {
  'worklet';
  const L = PIXEL_LAYOUT[format];
  if (!L) return 1;
  const stride = Math.floor(pixels.length / height);
  let sum = 0;
  let n = 0;
  for (let y = 0; y < height; y += step) {
    const row = y * stride;
    for (let x = 0; x < width; x += step) {
      const s = row + x * L.bpp;
      sum += 0.299 * pixels[s + L.r] + 0.587 * pixels[s + L.g] + 0.114 * pixels[s + L.b];
      n++;
    }
  }
  return n ? sum / n / 255 : 1;
}

/** Where a letterboxed image sits inside the size×size model input (pixels). */
export interface Letterbox {
  size: number;
  w: number; // scaled image width inside the input
  h: number;
  padX: number;
  padY: number;
}

/** Scale (W, H) to fit size×size keeping aspect, centred (Ultralytics-style letterbox). */
export function letterbox(W: number, H: number, size: number): Letterbox {
  'worklet';
  const k = size / Math.max(W, H);
  const w = Math.max(1, Math.round(W * k));
  const h = Math.max(1, Math.round(H * k));
  return { size, w, h, padX: Math.floor((size - w) / 2), padY: Math.floor((size - h) / 2) };
}

/**
 * YOLO input with letterbox: w×h raw pixels (already resized to lb.w × lb.h) placed centred in a
 * float32 [1, 3, size, size] planar RGB 0–1 tensor, padding grey (114/255) like Ultralytics.
 */
export function toLetterboxTensor(pixels: Uint8Array, format: string, lb: Letterbox): ArrayBuffer {
  'worklet';
  const L = PIXEL_LAYOUT[format];
  if (!L) throw new Error(`unsupported pixel format ${format}`);
  const { size, w, h, padX, padY } = lb;
  const stride = Math.floor(pixels.length / h);
  const n = size * size;
  const out = new Float32Array(n * 3).fill(114 / 255);
  const k = 1 / 255;
  for (let y = 0; y < h; y++) {
    const row = y * stride;
    const o = (y + padY) * size + padX;
    for (let x = 0; x < w; x++) {
      const s = row + x * L.bpp;
      const i = o + x;
      out[i] = pixels[s + L.r] * k;
      out[n + i] = pixels[s + L.g] * k;
      out[2 * n + i] = pixels[s + L.b] * k;
    }
  }
  return out.buffer;
}

/** Map a box normalised to the letterboxed input back to the original image (0–1, clamped). */
export function unletterbox(box: [number, number, number, number], lb: Letterbox): [number, number, number, number] {
  'worklet';
  const c = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  return [
    c((box[0] * lb.size - lb.padX) / lb.w),
    c((box[1] * lb.size - lb.padY) / lb.h),
    c((box[2] * lb.size - lb.padX) / lb.w),
    c((box[3] * lb.size - lb.padY) / lb.h),
  ];
}
