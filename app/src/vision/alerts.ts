import type { ClipKey } from '../audio/clips.generated';
import type { Priority, Utterance } from '../audio/scheduler';
import type { Lang } from '../core/lang';
import { ALERT_CLASSES, ANIMALS, isAlertClass, VEHICLES } from './labels';
import type { Alert } from './tracker';

/** Alert order when several objects appear on one frame: vehicles > people > animals > the rest. */
export function rank(label: string): number {
  if (VEHICLES.has(label)) return 0;
  if (label === 'person') return 1;
  if (ANIMALS.has(label)) return 2;
  return 3;
}

/** F9: vehicles are P0 (they interrupt an answer); every other object is P2 (waits its turn). */
export function schedulerPriority(label: string): Priority {
  return VEHICLES.has(label) ? 0 : 2;
}

/** Quiet mode (F5): only vehicles are announced. */
export function passesQuietMode(label: string, quiet: boolean): boolean {
  return !quiet || VEHICLES.has(label);
}

export interface FrameInfo {
  frameId: number;
  frameTs: number; // monotonic ms when the frame was captured (for stale drops and metrics)
}

/**
 * One utterance per alert, just the object's name ("Bottle", "Car"; P17: no direction or
 * distance), most important first. They share the frameId so the scheduler coalesces them
 * (max 2 per frame).
 */
export function buildAlertUtterances(
  alerts: Alert[],
  frame: FrameInfo,
  lang: Lang,
  opts: { quiet: boolean; newId: () => string },
): Utterance[] {
  return alerts
    .filter((a) => isAlertClass(a.track.label) && passesQuietMode(a.track.label, opts.quiet))
    .sort((a, b) => rank(a.track.label) - rank(b.track.label))
    .map((a) => {
      const t = a.track;
      return {
        id: opts.newId(),
        priority: schedulerPriority(t.label),
        source: 'reflex' as const,
        lang,
        createdAt: frame.frameTs,
        frameId: frame.frameId,
        parts: [{ kind: 'clip' as const, key: ALERT_CLASSES[t.label] as ClipKey }],
      };
    });
}
