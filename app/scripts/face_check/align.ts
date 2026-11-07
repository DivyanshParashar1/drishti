// Run the app's face alignment on photos; see landmarks.py for usage.
import { readFileSync, writeFileSync } from 'node:fs';
import { FACE_SIZE, planFaceCrop, warpFace } from '../../src/vision/faceAlign';
const lm = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let k = 0;
for (const [path, f] of Object.entries<any>(lm)) {
  const full = new Uint8Array(readFileSync(f.raw));
  for (const [variant, useLm, fmt] of [['aligned', true, 'RGBA'], ['box', false, 'RGBA'], ['bgr', true, 'BGRA']] as const) {
    const p0 = planFaceCrop(f.box, useLm ? f.lm : undefined, f.W, f.H, 144, 2.2);
    const [x1, y1, x2, y2] = p0.rect;
    const cw = x2 - x1, ch = y2 - y1;
    const p = planFaceCrop(f.box, useLm ? f.lm : undefined, f.W, f.H, Math.max(cw, ch), 2.2); // k = 1: crop only
    const crop = new Uint8Array(cw * ch * 4);
    for (let y = 0; y < ch; y++) crop.set(full.subarray(((y1 + y) * f.W + x1) * 4, ((y1 + y) * f.W + x2) * 4), y * cw * 4);
    const t = new Float32Array(FACE_SIZE * FACE_SIZE * 3);
    warpFace(crop, fmt, p.width, p.height, p.toFace, t);
    writeFileSync(`${process.argv[3]}/${variant}_${k}.f32`, Buffer.from(t.buffer));
  }
  k++;
}
console.log('wrote', k * 3, 'tensors');
