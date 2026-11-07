import { FACE_SIZE } from '../faceAlign';
import { EMBED_DIM, embedFaces, type CropImage, type Embedder, type MlFace } from '../faceWorklet';

const cfg = { minFacePx: 80, maxFacesPerFrame: 2, cropScale: 2.2 };

/** A uniform-grey image that records crop/resize calls. */
function fakeImage(width: number, height: number, calls: string[] = []): CropImage {
  const img = (w: number, h: number): CropImage => ({
    width: w,
    height: h,
    crop: (x1, y1, x2, y2) => {
      calls.push(`crop ${x1},${y1},${x2},${y2}`);
      return img(x2 - x1, y2 - y1);
    },
    resize: (rw, rh) => {
      calls.push(`resize ${rw}x${rh}`);
      return img(rw, rh);
    },
    toRawPixelData: () => ({ buffer: new Uint8Array(w * h * 4).fill(128).buffer, pixelFormat: 'RGBA' }),
  });
  return img(width, height);
}

/** Returns [2, 128]: row k is all (k + 1), so normalised rows are distinguishable. */
function fakeEmbedder(seen: ArrayBuffer[][] = []): Embedder {
  return {
    runSync: (inputs) => {
      seen.push(inputs);
      const out = new Float32Array(2 * EMBED_DIM);
      out.fill(1, 0, EMBED_DIM);
      out.fill(2, EMBED_DIM);
      out[EMBED_DIM] = -2; // make row 2 differ in direction too
      return [out.buffer];
    },
  };
}

const face = (x: number, y: number, w: number, frame = { w: 720, h: 1280 }, landmarks?: MlFace['landmarks']): MlFace => ({
  bounds: { x, y, width: w, height: w },
  landmarks,
  frameWidth: frame.w,
  frameHeight: frame.h,
});

test('no embedder: boxes only, normalised, largest first, at most 4', () => {
  const faces = [face(0, 0, 50), face(100, 100, 200), face(10, 10, 60), face(20, 20, 70), face(30, 30, 90)];
  const out = embedFaces(faces, fakeImage(720, 1280), null, cfg);
  expect(out.map((f) => f.widthPx)).toEqual([200, 90, 70, 60]);
  expect(out[0].box[0]).toBeCloseTo(100 / 720);
  expect(out[0].box[3]).toBeCloseTo(300 / 1280);
  expect(out.every((f) => f.embedding === null)).toBe(true);
});

test('only faces ≥ 80 px are embedded, the two largest, in one call', () => {
  const seen: ArrayBuffer[][] = [];
  const calls: string[] = [];
  const faces = [face(400, 400, 100), face(100, 100, 200), face(10, 10, 79), face(500, 800, 150)];
  const out = embedFaces(faces, fakeImage(720, 1280, calls), fakeEmbedder(seen), cfg);
  expect(seen).toHaveLength(1);
  expect(seen[0].map((b) => b.byteLength)).toEqual([FACE_SIZE * FACE_SIZE * 3 * 4, FACE_SIZE * FACE_SIZE * 3 * 4]);
  expect(out.map((f) => f.widthPx)).toEqual([200, 150, 100, 79]);
  expect(out[0].embedding![0]).toBeCloseTo(1 / Math.sqrt(EMBED_DIM)); // row 1
  expect(out[1].embedding![0]).toBeCloseTo(-1 / Math.sqrt(EMBED_DIM)); // row 2
  expect(out[2].embedding).toBeNull(); // third qualifying face: over the per-frame limit
  expect(out[3].embedding).toBeNull(); // too small
  expect(calls.filter((c) => c.startsWith('crop'))).toHaveLength(2);
  // Grey image → the aligned tensor is grey wherever the window is inside the crop.
  const t = new Float32Array(seen[0][0]);
  expect(t[56 * FACE_SIZE + 56]).toBeCloseTo(128 / 255);
});

test('one qualifying face is sent as both inputs', () => {
  const seen: ArrayBuffer[][] = [];
  const out = embedFaces([face(200, 300, 120)], fakeImage(720, 1280), fakeEmbedder(seen), cfg);
  expect(Array.from(new Float32Array(seen[0][1]))).toEqual(Array.from(new Float32Array(seen[0][0])));
  expect(out[0].embedding).toHaveLength(EMBED_DIM);
});

test('ML Kit coordinates are rescaled when its frame size differs from the image', () => {
  const calls: string[] = [];
  const lm = { LEFT_EYE: { x: 130, y: 120 }, RIGHT_EYE: { x: 70, y: 120 } };
  const out = embedFaces([face(50, 50, 100, { w: 360, h: 640 }, lm)], fakeImage(720, 1280, calls), fakeEmbedder(), cfg);
  expect(out[0].widthPx).toBe(200); // 100 px in a half-size frame
  expect(out[0].box).toEqual([100 / 720, 100 / 1280, 300 / 720, 300 / 1280]);
  expect(calls[0]).toBe('crop 0,0,420,420'); // centre (200, 200), side 2.2 × 200 = 440, clamped at 0
});
