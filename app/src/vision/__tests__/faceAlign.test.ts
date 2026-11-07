import {
  applySimilarity,
  FACE_SIZE,
  fitSimilarity,
  l2normalize,
  landmarkPairs,
  planFaceCrop,
  REFERENCE_112,
  warpFace,
} from '../faceAlign';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

test('reference points are the InsightFace 112×112 template (arcface_dst)', () => {
  close(REFERENCE_112[0][0], 38.2946, 1e-3);
  close(REFERENCE_112[0][1], 51.6963, 1e-3);
  close(REFERENCE_112[2][0], 56.0252, 1e-3);
  close(REFERENCE_112[4][0], 70.7299, 1e-3);
  close(REFERENCE_112[4][1], 92.2041, 1e-3);
});

test('fitSimilarity recovers a known rotation + scale + shift exactly', () => {
  const truth = { a: 0.8 * Math.cos(0.3), b: 0.8 * Math.sin(0.3), tx: 12, ty: -5 };
  const src = [
    [10, 20],
    [50, 22],
    [15, 70],
    [45, 72],
  ];
  const dst = src.map(([x, y]) => applySimilarity(truth, x, y));
  const m = fitSimilarity(src, dst);
  close(m.a, truth.a);
  close(m.b, truth.b);
  close(m.tx, truth.tx);
  close(m.ty, truth.ty);
});

test('fitSimilarity rejects coincident points', () => {
  expect(() => fitSimilarity([[1, 1], [1, 1]], [[0, 0], [1, 1]])).toThrow('degenerate');
});

test('landmarkPairs: needs both eyes, sorts by x regardless of ML Kit left/right naming', () => {
  expect(landmarkPairs({ LEFT_EYE: { x: 1, y: 1 } })).toBeNull();
  const p = landmarkPairs({
    LEFT_EYE: { x: 80, y: 50 }, // subject's left eye is on the image right
    RIGHT_EYE: { x: 40, y: 50 },
    MOUTH_LEFT: { x: 75, y: 90 },
    MOUTH_RIGHT: { x: 45, y: 90 },
    NOSE_BASE: { x: 60, y: 70 },
  })!;
  expect(p.src).toEqual([
    [40, 50],
    [80, 50],
    [45, 90],
    [75, 90],
  ]);
  expect(p.dst).toEqual([REFERENCE_112[0], REFERENCE_112[1], REFERENCE_112[3], REFERENCE_112[4]]);
  expect(landmarkPairs({ LEFT_EYE: { x: 1, y: 1 }, RIGHT_EYE: { x: 9, y: 1 } })!.src).toHaveLength(2);
});

/** A face whose landmarks sit exactly on the template, scaled by s and shifted to (ox, oy). */
function templateFace(s: number, ox: number, oy: number) {
  const P = REFERENCE_112.map(([x, y]) => ({ x: ox + x * s, y: oy + y * s }));
  return { LEFT_EYE: P[1], RIGHT_EYE: P[0], MOUTH_LEFT: P[4], MOUTH_RIGHT: P[3] };
}

test('planFaceCrop: square crop around the box, clamped to the image, landmarks land on the template', () => {
  const lm = templateFace(2, 100, 200); // face spans ~ (188..336, 306..360) px
  const box = { x: 170, y: 260, width: 180, height: 180 };
  const plan = planFaceCrop(box, lm, 720, 1280, 144);
  expect(plan.rect).toEqual([62, 152, 458, 548]); // 2.2 × 180 = 396 px square
  expect(plan.width).toBe(144);
  expect(plan.height).toBe(144);
  const k = 144 / 396;
  for (const [i, p] of [lm.RIGHT_EYE, lm.LEFT_EYE, lm.MOUTH_RIGHT, lm.MOUTH_LEFT].entries()) {
    const [u, v] = applySimilarity(plan.toFace, (p.x - 62) * k, (p.y - 152) * k);
    const ref = REFERENCE_112[[0, 1, 3, 4][i]];
    close(u, ref[0], 1e-6);
    close(v, ref[1], 1e-6);
  }

  const edge = planFaceCrop({ x: 0, y: 0, width: 100, height: 100 }, undefined, 720, 1280, 144);
  expect(edge.rect).toEqual([0, 0, 160, 160]);
  expect(edge.width).toBe(144);
});

test('planFaceCrop keeps aspect when the crop is clamped on one side', () => {
  const plan = planFaceCrop({ x: 600, y: 500, width: 100, height: 100 }, undefined, 720, 1280, 144);
  expect(plan.rect).toEqual([540, 440, 720, 660]); // right edge clamped: 180 × 220
  expect(plan.height).toBe(144);
  expect(plan.width).toBe(118);
});

/** RGBA image where R = x, G = y, B = 7, with `pad` bytes of row padding. */
function coordImage(w: number, h: number, pad = 0) {
  const stride = w * 4 + pad;
  const px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * stride + x * 4;
      px[i] = x;
      px[i + 1] = y;
      px[i + 2] = 7;
      px[i + 3] = 255;
    }
  return px;
}

test('warpFace samples the inverse-mapped source pixel (NCHW, 0–1), padded rows, zero outside', () => {
  const w = 200;
  const h = 200;
  const px = coordImage(w, h, 16);
  const m = { a: 0.5, b: 0, tx: 0, ty: 0 }; // face pixel (u, v) ← source (2u, 2v)
  const out = new Float32Array(FACE_SIZE * FACE_SIZE * 3);
  warpFace(px, 'RGBA', w, h, m, out);
  const n = FACE_SIZE * FACE_SIZE;
  const at = (c: number, u: number, v: number) => out[c * n + v * FACE_SIZE + u] * 255;
  close(at(0, 10, 20), 20, 1e-3);
  close(at(1, 10, 20), 40, 1e-3);
  close(at(2, 10, 20), 7, 1e-3);
  expect(at(0, 105, 5)).toBe(0); // source x = 210 is outside

  // Rotation by 90°: (u, v) ← (v, −u + 150); bilinear between pixels is exact on a linear ramp.
  const rot = { a: 0, b: 1, tx: 150, ty: 0 }; // x' = −y + 150, y' = x
  warpFace(px, 'BGRA', w, h, rot, out);
  // BGRA: channel 0 (R) reads byte 2 (= 7), channel 2 (B) reads byte 0 (= x).
  close(at(0, 50, 30), 7, 1e-3);
  close(at(2, 50, 30), 30, 1e-3); // source x = v = 30
  close(at(1, 50, 30), 100, 1e-3); // source y = 150 − u = 100
});

test('warpFace with half-pixel source positions interpolates', () => {
  const px = coordImage(50, 50);
  const out = new Float32Array(FACE_SIZE * FACE_SIZE * 3);
  warpFace(px, 'RGBA', 50, 50, { a: 1, b: 0, tx: -0.5, ty: 0 }, out);
  close(out[3] * 255, 3.5, 1e-3); // u = 3 ← x = 3.5
});

test('l2normalize returns a unit plain array of a slice', () => {
  const v = l2normalize(new Float32Array([9, 3, 4, 9]), 1, 2);
  expect(Array.isArray(v)).toBe(true);
  close(v[0], 0.6);
  close(v[1], 0.8);
  expect(l2normalize([0, 0])).toEqual([0, 0]);
});
