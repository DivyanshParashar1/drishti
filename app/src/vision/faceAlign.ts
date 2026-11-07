import { PIXEL_LAYOUT } from './preprocess';

/**
 * Face alignment for MobileFaceNet (F3): fit a similarity transform from ML Kit landmarks to the
 * reference points the weights were trained with, then warp the face into a 112×112 NCHW RGB 0–1
 * tensor (normalisation and flip augmentation are inside the model graph).
 *
 * All functions here run in the frame worklet as well as in Jest.
 */
export const FACE_SIZE = 112;

/**
 * foamliu/MobileFaceNet `get_reference_facial_points((112, 112), inner_padding_factor=0.25,
 * default_square=True)`: the 96×112 MTCNN template padded to square (+8 px in x), then padded by
 * 25% on each side (+28 px) and scaled from 168 to 112. Order: eye, eye, nose tip, mouth corner,
 * mouth corner, image-left first.
 */
const TEMPLATE_96x112 = [
  [30.29459953, 51.69630051],
  [65.53179932, 51.50139999],
  [48.02519989, 71.73660278],
  [33.54930115, 92.3655014],
  [62.72990036, 92.20410156],
];
export const REFERENCE_112 = TEMPLATE_96x112.map(([x, y]) => [((x + 8 + 28) * 2) / 3, ((y + 28) * 2) / 3]);

export interface Point {
  x: number;
  y: number;
}

/** ML Kit landmarks, in image pixels. Left/right naming is not relied on (sorted by x instead). */
export interface FaceLandmarks {
  LEFT_EYE?: Point;
  RIGHT_EYE?: Point;
  MOUTH_LEFT?: Point;
  MOUTH_RIGHT?: Point;
  NOSE_BASE?: Point;
}

/** x' = a·x − b·y + tx, y' = b·x + a·y + ty (rotation + uniform scale + shift). */
export interface Similarity {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

/** Least-squares similarity transform taking src[i] to dst[i] (needs ≥ 2 distinct points). */
export function fitSimilarity(src: number[][], dst: number[][]): Similarity {
  'worklet';
  const n = src.length;
  let sx = 0;
  let sy = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    sx += src[i][0];
    sy += src[i][1];
    dx += dst[i][0];
    dy += dst[i][1];
  }
  sx /= n;
  sy /= n;
  dx /= n;
  dy /= n;
  let num1 = 0;
  let num2 = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const px = src[i][0] - sx;
    const py = src[i][1] - sy;
    const qx = dst[i][0] - dx;
    const qy = dst[i][1] - dy;
    num1 += px * qx + py * qy;
    num2 += px * qy - py * qx;
    den += px * px + py * py;
  }
  if (den === 0) throw new Error('degenerate landmarks');
  const a = num1 / den;
  const b = num2 / den;
  return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) };
}

export function applySimilarity(m: Similarity, x: number, y: number): [number, number] {
  'worklet';
  return [m.a * x - m.b * y + m.tx, m.b * x + m.a * y + m.ty];
}

/**
 * Landmark pairs (image px) → reference points. Both eyes are required; mouth corners are used
 * when present. The nose is left out: ML Kit's NOSE_BASE sits below the template's nose tip, which
 * would bias the fit. Returns null if the eyes are missing.
 */
export function landmarkPairs(lm: FaceLandmarks): { src: number[][]; dst: number[][] } | null {
  'worklet';
  const e1 = lm.LEFT_EYE;
  const e2 = lm.RIGHT_EYE;
  if (!e1 || !e2) return null;
  const [eyeL, eyeR] = e1.x <= e2.x ? [e1, e2] : [e2, e1];
  const src = [
    [eyeL.x, eyeL.y],
    [eyeR.x, eyeR.y],
  ];
  const dst = [REFERENCE_112[0], REFERENCE_112[1]];
  const m1 = lm.MOUTH_LEFT;
  const m2 = lm.MOUTH_RIGHT;
  if (m1 && m2) {
    const [mL, mR] = m1.x <= m2.x ? [m1, m2] : [m2, m1];
    src.push([mL.x, mL.y], [mR.x, mR.y]);
    dst.push(REFERENCE_112[3], REFERENCE_112[4]);
  }
  return { src, dst };
}

export interface CropPlan {
  /** Crop rectangle in image px, [x1, y1, x2, y2] (integers, inside the image). */
  rect: [number, number, number, number];
  /** Size to resize the crop to before reading pixels (aspect kept, longest side = maxSide). */
  width: number;
  height: number;
  /** Maps resized-crop pixels → 112×112 aligned face pixels. */
  toFace: Similarity;
}

/**
 * Crop a square around the face, big enough to hold the aligned window (the template pads the
 * face by 25% per side, about 2× the ML Kit box width), clamp it to the image, and express the
 * landmark fit in the resized crop's pixels. Falls back to the box (eyes-free) when landmarks are
 * missing: the box is mapped to the template's inner face area.
 */
export function planFaceCrop(
  box: { x: number; y: number; width: number; height: number },
  lm: FaceLandmarks | undefined,
  imageWidth: number,
  imageHeight: number,
  maxSide = 144,
  scale = 2.2,
): CropPlan {
  'worklet';
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const half = (Math.max(box.width, box.height) * scale) / 2;
  const x1 = Math.max(0, Math.round(cx - half));
  const y1 = Math.max(0, Math.round(cy - half));
  const x2 = Math.min(imageWidth, Math.round(cx + half));
  const y2 = Math.min(imageHeight, Math.round(cy + half));
  const cw = x2 - x1;
  const ch = y2 - y1;
  const k = maxSide / Math.max(cw, ch);
  const width = Math.max(1, Math.round(cw * k));
  const height = Math.max(1, Math.round(ch * k));
  const kx = width / cw;
  const ky = height / ch;
  const toCrop = (p: number[]) => [(p[0] - x1) * kx, (p[1] - y1) * ky];

  const pairs = lm ? landmarkPairs(lm) : null;
  let src: number[][];
  let dst: number[][];
  if (pairs) {
    src = pairs.src.map(toCrop);
    dst = pairs.dst;
  } else {
    // Box corners → the template's eye-to-mouth span widened to the face (rough, no rotation).
    src = [toCrop([box.x, box.y]), toCrop([box.x + box.width, box.y + box.height])];
    dst = [
      [REFERENCE_112[0][0] - 12, REFERENCE_112[0][1] - 22],
      [REFERENCE_112[4][0] + 12, REFERENCE_112[4][1] + 14],
    ];
  }
  return { rect: [x1, y1, x2, y2], width, height, toFace: fitSimilarity(src, dst) };
}

/**
 * Warp raw pixels (the resized crop) into a 112×112 NCHW RGB 0–1 tensor at `out[offset…]`, by
 * inverse-mapping every output pixel through `toFace` and sampling bilinearly. Outside → 0.
 * Rows may be padded: the stride is derived from the buffer length.
 */
export function warpFace(
  pixels: Uint8Array,
  format: string,
  width: number,
  height: number,
  toFace: Similarity,
  out: Float32Array,
  offset = 0,
): void {
  'worklet';
  const L = PIXEL_LAYOUT[format];
  if (!L) throw new Error(`unsupported pixel format ${format}`);
  const stride = Math.floor(pixels.length / height);
  const { a, b, tx, ty } = toFace;
  const det = a * a + b * b;
  // Inverse: p = R⁻¹ (q − t), R⁻¹ = [a b; −b a] / det.
  const ia = a / det;
  const ib = b / det;
  const n = FACE_SIZE * FACE_SIZE;
  const k = 1 / 255;
  for (let v = 0; v < FACE_SIZE; v++) {
    for (let u = 0; u < FACE_SIZE; u++) {
      const qx = u - tx;
      const qy = v - ty;
      const x = ia * qx + ib * qy;
      const y = -ib * qx + ia * qy;
      const i = offset + v * FACE_SIZE + u;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      if (x0 < 0 || y0 < 0 || x0 >= width - 1 || y0 >= height - 1) {
        out[i] = 0;
        out[i + n] = 0;
        out[i + 2 * n] = 0;
        continue;
      }
      const fx = x - x0;
      const fy = y - y0;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const p00 = y0 * stride + x0 * L.bpp;
      const p10 = p00 + L.bpp;
      const p01 = p00 + stride;
      const p11 = p01 + L.bpp;
      out[i] = (pixels[p00 + L.r] * w00 + pixels[p10 + L.r] * w10 + pixels[p01 + L.r] * w01 + pixels[p11 + L.r] * w11) * k;
      out[i + n] = (pixels[p00 + L.g] * w00 + pixels[p10 + L.g] * w10 + pixels[p01 + L.g] * w01 + pixels[p11 + L.g] * w11) * k;
      out[i + 2 * n] = (pixels[p00 + L.b] * w00 + pixels[p10 + L.b] * w10 + pixels[p01 + L.b] * w01 + pixels[p11 + L.b] * w11) * k;
    }
  }
}

/** L2-normalised copy of v[start, start + len) as a plain array (crosses the worklet boundary). */
export function l2normalize(v: ArrayLike<number>, start = 0, len = v.length): number[] {
  'worklet';
  let s = 0;
  for (let i = 0; i < len; i++) s += v[start + i] * v[start + i];
  const inv = s > 0 ? 1 / Math.sqrt(s) : 0;
  const out = new Array<number>(len);
  for (let i = 0; i < len; i++) out[i] = v[start + i] * inv;
  return out;
}
