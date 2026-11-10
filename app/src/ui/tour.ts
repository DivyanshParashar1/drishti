import type { ClipKey } from '../audio/clips.generated';
import { MENU_BUTTON_SIZE } from './MenuButton';
import { shape } from './tokens';

/** What a tour step points at. */
export type TourTarget = 'none' | 'camera' | 'captions' | 'leftStrip' | 'rightStrip' | 'strip' | 'latency' | 'menu';

export interface TourStep {
  key: ClipKey; // the line, spoken and shown (sys.tour_N, in every language)
  target: TourTarget;
}

/** P17 app tour: plays on first launch and from Menu → App tour. One spoken line per step. */
export const TOUR: readonly TourStep[] = [
  { key: 'sys.tour_1', target: 'none' },
  { key: 'sys.tour_2', target: 'camera' },
  { key: 'sys.tour_3', target: 'captions' },
  { key: 'sys.tour_4', target: 'leftStrip' },
  { key: 'sys.tour_5', target: 'strip' },
  { key: 'sys.tour_6', target: 'rightStrip' },
  { key: 'sys.tour_7', target: 'strip' },
  { key: 'sys.tour_8', target: 'latency' },
  { key: 'sys.tour_9', target: 'menu' },
  { key: 'sys.tour_10', target: 'camera' },
  { key: 'sys.tour_11', target: 'none' },
];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where each target sits, from the same layout numbers the HUD uses (Hud.tsx): the strip at
 * `top`, temples and latency card below it, the caption dock at the bottom.
 */
export function targetRect(target: TourTarget, screen: { width: number; height: number }, top: number): Rect | null {
  const m = shape.margin;
  const stripH = shape.stripMinHeight;
  const below = top + stripH + 16;
  const templeBottom = 176;
  switch (target) {
    case 'none':
      return null;
    case 'strip':
      return { x: m, y: top, width: screen.width - 2 * m - MENU_BUTTON_SIZE - 8, height: stripH };
    case 'menu':
      return { x: screen.width - m - MENU_BUTTON_SIZE, y: top, width: MENU_BUTTON_SIZE, height: MENU_BUTTON_SIZE };
    case 'latency':
      return { x: screen.width - shape.latencyCardRight - shape.latencyCardWidth, y: below, width: shape.latencyCardWidth, height: 76 };
    case 'leftStrip':
      return { x: 0, y: below, width: shape.templeWidth, height: screen.height - below - templeBottom };
    case 'rightStrip':
      return { x: screen.width - shape.templeWidth, y: below, width: shape.templeWidth, height: screen.height - below - templeBottom };
    case 'captions':
      return { x: m, y: screen.height - shape.dockBottom - 120, width: screen.width - 2 * m, height: 120 };
    case 'camera':
      return { x: shape.templeWidth + 8, y: below + 90, width: screen.width - 2 * (shape.templeWidth + 8), height: screen.height - below - 90 - templeBottom - 20 };
  }
}

/** The text card goes on the half of the screen away from the highlight. */
export function cardAtTop(rect: Rect | null, screenHeight: number): boolean {
  if (!rect) return false;
  return rect.y + rect.height / 2 > screenHeight / 2;
}
