import type { Box } from './types';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Map a normalised box in the frame onto a view that shows the frame "cover"-scaled
 * (fills the view, centred, overflow cropped), like the camera preview.
 */
export function boxToView(box: Box, frame: { width: number; height: number }, view: { width: number; height: number }): Rect {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const offX = (view.width - frame.width * scale) / 2;
  const offY = (view.height - frame.height * scale) / 2;
  const x1 = box[0] * frame.width * scale + offX;
  const y1 = box[1] * frame.height * scale + offY;
  const x2 = box[2] * frame.width * scale + offX;
  const y2 = box[3] * frame.height * scale + offY;
  return { left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
}
