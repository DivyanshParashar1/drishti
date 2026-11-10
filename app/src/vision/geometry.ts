import { VISION, type VisionConfig } from './config';
import { isAlertClass } from './labels';
import type { Box, Detection, Direction, Distance } from './types';

export const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);

/**
 * Left / ahead / right by the box's horizontal centre in thirds. With a previous direction, the
 * centre must cross the line by `hysteresis` to change, so an object on a line doesn't flip-flop.
 */
export function direction(box: Box, previous?: Direction, hysteresis = VISION.directionHysteresis): Direction {
  const cx = (box[0] + box[2]) / 2;
  const lo = 1 / 3;
  const hi = 2 / 3;
  if (previous) {
    const m = hysteresis;
    if (previous === 'left' && cx < lo + m) return 'left';
    if (previous === 'right' && cx > hi - m) return 'right';
    if (previous === 'ahead' && cx >= lo - m && cx <= hi + m) return 'ahead';
  }
  return cx < lo ? 'left' : cx > hi ? 'right' : 'ahead';
}

/** F1: near if the box is taller than 45% of the frame or its bottom is in the lowest 15%. */
export function distance(box: Box, cfg: Pick<VisionConfig, 'nearHeight' | 'nearBottom'> = VISION): Distance {
  return box[3] - box[1] > cfg.nearHeight || box[3] > cfg.nearBottom ? 'near' : 'far';
}

/** F1 filters: alert classes only, confidence ≥ minScore, area ≥ minArea. */
export function filterDetections(
  dets: Detection[],
  cfg: Pick<VisionConfig, 'minScore' | 'minArea'> = VISION,
): Detection[] {
  return dets.filter((d) => isAlertClass(d.label) && d.score >= cfg.minScore && area(d.box) >= cfg.minArea);
}
