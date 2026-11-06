import { EFFDET_LABELS, YOLO_LABELS } from './labels';
import type { Box, Detection } from './types';

type Num = ArrayLike<number>;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * EfficientDet-Lite0 with its built-in NMS. Outputs in model order:
 * boxes [1,25,4] as y1,x1,y2,x2; classes [1,25] (index into the 90-id map); scores [1,25]; count [1].
 */
export function decodeEfficientDet(outputs: Num[], minScore: number): Detection[] {
  'worklet';
  const [boxes, classes, scores, count] = outputs;
  const n = Math.min(Math.round(count[0]), scores.length);
  const out: Detection[] = [];
  for (let i = 0; i < n; i++) {
    const score = scores[i];
    if (score < minScore) continue;
    const label = EFFDET_LABELS[Math.round(classes[i])] ?? '???';
    const box: Box = [
      clamp01(boxes[i * 4 + 1]),
      clamp01(boxes[i * 4]),
      clamp01(boxes[i * 4 + 3]),
      clamp01(boxes[i * 4 + 2]),
    ];
    out.push({ label, score, box });
  }
  return out;
}

export function iou(a: Box, b: Box): number {
  'worklet';
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * YOLO11n raw output [1, 84, n] (row-major: 4 box rows cx,cy,w,h normalised, then 80 class rows),
 * with greedy class-wise NMS. `allowed[c]` false skips class c before NMS (a plain array, not a Set,
 * so it can be captured by a worklet).
 */
export function decodeYolo(
  data: Num,
  n: number,
  minScore: number,
  iouThreshold = 0.45,
  maxDetections = 20,
  allowed?: readonly boolean[],
): Detection[] {
  'worklet';
  const cand: { cls: number; score: number; box: Box }[] = [];
  for (let j = 0; j < n; j++) {
    let best = -1;
    let score = minScore;
    for (let c = 0; c < 80; c++) {
      if (allowed && !allowed[c]) continue;
      const s = data[(4 + c) * n + j];
      if (s >= score) {
        score = s;
        best = c;
      }
    }
    if (best < 0) continue;
    const cx = data[j];
    const cy = data[n + j];
    const w = data[2 * n + j];
    const h = data[3 * n + j];
    cand.push({ cls: best, score, box: [clamp01(cx - w / 2), clamp01(cy - h / 2), clamp01(cx + w / 2), clamp01(cy + h / 2)] });
  }
  cand.sort((a, b) => b.score - a.score);
  const kept: typeof cand = [];
  for (const d of cand) {
    if (kept.length >= maxDetections) break;
    let ok = true;
    for (const k of kept) {
      if (k.cls === d.cls && iou(k.box, d.box) > iouThreshold) {
        ok = false;
        break;
      }
    }
    if (ok) kept.push(d);
  }
  return kept.map((d) => ({ label: YOLO_LABELS[d.cls], score: d.score, box: d.box }));
}
