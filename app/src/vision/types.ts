/** Normalised [x1, y1, x2, y2] in the upright image, 0–1. */
export type Box = [number, number, number, number];

export interface Detection {
  label: string;
  score: number;
  box: Box;
}

export type Direction = 'left' | 'ahead' | 'right';
export type Distance = 'near' | 'far';
