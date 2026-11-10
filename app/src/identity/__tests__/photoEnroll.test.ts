import { EMBED_DIM, type CropImage, type Embedder } from '../../vision/faceWorklet';
import { embedPhoto, type PhotoDeps, type PhotoFace } from '../photoEnroll';

function fakeImage(width: number, height: number, calls: string[]): CropImage {
  const img = (w: number, h: number): CropImage => ({
    width: w,
    height: h,
    crop: (x1, y1, x2, y2) => (calls.push(`crop ${x1},${y1},${x2},${y2}`), img(x2 - x1, y2 - y1)),
    resize: (rw, rh) => img(rw, rh),
    toRawPixelData: () => ({ buffer: new Uint8Array(w * h * 4).fill(128).buffer, pixelFormat: 'RGBA' }),
  });
  return img(width, height);
}

const embedder: Embedder = {
  runSync: () => [new Float32Array(2 * EMBED_DIM).fill(1).buffer],
};

function deps(faces: PhotoFace[] | Error, calls: string[] = []): PhotoDeps {
  return {
    detect: async () => {
      if (faces instanceof Error) throw faces;
      return faces;
    },
    load: async () => fakeImage(1000, 1000, calls),
    embedder: async () => embedder,
  };
}

const face = (left: number, top: number, w: number, landmarks = true): PhotoFace => ({
  frame: { left, top, width: w, height: w },
  landmarks: landmarks
    ? {
        leftEye: { position: { x: left + 0.3 * w, y: top + 0.4 * w } },
        rightEye: { position: { x: left + 0.7 * w, y: top + 0.4 * w } },
        mouthLeft: { position: { x: left + 0.35 * w, y: top + 0.75 * w } },
        mouthRight: { position: { x: left + 0.65 * w, y: top + 0.75 * w } },
      }
    : undefined,
});

test('one clear face → a unit-length 128-d embedding, cropped around that face', async () => {
  const calls: string[] = [];
  const r = await embedPhoto('file:///p.jpg', deps([face(300, 300, 400)], calls));
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.embedding).toHaveLength(EMBED_DIM);
  expect(Math.hypot(...r.embedding)).toBeCloseTo(1);
  expect(calls[0]).toMatch(/^crop /);
});

test('works without landmarks (box fallback)', async () => {
  expect((await embedPhoto('x', deps([face(300, 300, 400, false)]))).ok).toBe(true);
});

test.each([
  ['no face', [], 'no_face'],
  ['a group photo', [face(0, 0, 300), face(500, 0, 300)], 'many_faces'],
  ['a tiny face', [face(10, 10, 60)], 'too_small'],
] as const)('%s is refused with a reason', async (_, faces, reason) => {
  const r = await embedPhoto('x', deps([...faces]));
  expect(r).toMatchObject({ ok: false, reason });
});

test('an unreadable photo is reported, not thrown', async () => {
  const r = await embedPhoto('x', deps(new Error('decode failed')));
  expect(r).toMatchObject({ ok: false, reason: 'failed' });
  if (!r.ok) expect(r.message).toContain('decode failed');
});
