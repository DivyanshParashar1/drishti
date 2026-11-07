import type { FaceObs } from '../identity/identifier';
import { FACE_SIZE, l2normalize, planFaceCrop, warpFace, type FaceLandmarks } from './faceAlign';

/** The parts of an ML Kit face (react-native-vision-camera-face-detector) used here. */
export interface MlFace {
  bounds: { x: number; y: number; width: number; height: number };
  landmarks?: FaceLandmarks;
  frameWidth: number;
  frameHeight: number;
}

/** The parts of a nitro-image Image used here. */
export interface CropImage {
  width: number;
  height: number;
  crop(x1: number, y1: number, x2: number, y2: number): CropImage;
  resize(width: number, height: number): CropImage;
  toRawPixelData(): { buffer: ArrayBuffer; pixelFormat: string };
}

export interface Embedder {
  runSync(inputs: ArrayBuffer[]): ArrayBuffer[];
}

export interface FaceWorkletConfig {
  minFacePx: number;
  maxFacesPerFrame: number;
  cropScale: number;
}

export const EMBED_DIM = 128;
const MAX_REPORTED = 4;
const CROP_SIDE = 144;

/**
 * ML Kit faces → FaceObs. Coordinates are rescaled from ML Kit's frame to the converted image
 * (they should match: both are upright, but nothing here depends on it). Faces are sorted
 * largest first; the largest ≤ 2 that are ≥ minFacePx wide are cropped, aligned and embedded in
 * one call (the model takes two faces: img1, img2 → [2, 128]; one face is sent twice).
 */
export function embedFaces(faces: MlFace[], image: CropImage, embedder: Embedder | null, cfg: FaceWorkletConfig): FaceObs[] {
  'worklet';
  const W = image.width;
  const H = image.height;
  const scaled = faces.map((f) => {
    const sx = f.frameWidth > 0 ? W / f.frameWidth : 1;
    const sy = f.frameHeight > 0 ? H / f.frameHeight : 1;
    const b = { x: f.bounds.x * sx, y: f.bounds.y * sy, width: f.bounds.width * sx, height: f.bounds.height * sy };
    let lm: FaceLandmarks | undefined;
    if (f.landmarks) {
      lm = {};
      const keys = ['LEFT_EYE', 'RIGHT_EYE', 'MOUTH_LEFT', 'MOUTH_RIGHT', 'NOSE_BASE'] as const;
      for (const k of keys) {
        const p = f.landmarks[k];
        if (p) lm[k] = { x: p.x * sx, y: p.y * sy };
      }
    }
    return { b, lm };
  });
  scaled.sort((p, q) => q.b.width - p.b.width);
  const top = scaled.slice(0, MAX_REPORTED);
  const out: FaceObs[] = top.map(({ b }) => ({
    box: [b.x / W, b.y / H, (b.x + b.width) / W, (b.y + b.height) / H],
    widthPx: b.width,
    embedding: null,
  }));
  if (!embedder) return out;

  const chosen: number[] = [];
  for (let i = 0; i < top.length && chosen.length < cfg.maxFacesPerFrame; i++) {
    if (top[i].b.width >= cfg.minFacePx) chosen.push(i);
  }
  if (chosen.length === 0) return out;

  const n = FACE_SIZE * FACE_SIZE * 3;
  const tensors = [new Float32Array(n), new Float32Array(n)];
  for (let k = 0; k < chosen.length; k++) {
    const f = top[chosen[k]];
    const plan = planFaceCrop(f.b, f.lm, W, H, CROP_SIDE, cfg.cropScale);
    const [x1, y1, x2, y2] = plan.rect;
    const raw = image.crop(x1, y1, x2, y2).resize(plan.width, plan.height).toRawPixelData();
    warpFace(new Uint8Array(raw.buffer), raw.pixelFormat, plan.width, plan.height, plan.toFace, tensors[k]);
  }
  if (chosen.length === 1) tensors[1].set(tensors[0]);
  const res = new Float32Array(embedder.runSync([tensors[0].buffer, tensors[1].buffer])[0]);
  for (let k = 0; k < chosen.length; k++) out[chosen[k]].embedding = l2normalize(res, k * EMBED_DIM, EMBED_DIM);
  return out;
}
