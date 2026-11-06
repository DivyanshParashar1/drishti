import type { ClipKey } from '../audio/clips.generated';
import type { Priority, Utterance } from '../audio/scheduler';
import type { Lang } from '../core/lang';
import { ALERT_CLASSES, ANIMALS, isAlertClass, VEHICLES } from './labels';
import type { Alert } from './tracker';

/**
 * F1 priority, high to low: vehicles > any near object > animals > far people > other far
 * objects. Lower rank = more urgent.
 */
export function rank(label: string, dist: 'near' | 'far'): number {
  if (isAlertClass(label) && VEHICLES.has(label)) return 0;
  if (dist === 'near') return 1;
  if (isAlertClass(label) && ANIMALS.has(label)) return 2;
  if (label === 'person') return 3;
  return 4;
}

/** F9: vehicles and near hazards are P0 (interrupt anything); other alerts are P2. */
export function schedulerPriority(label: string, dist: 'near' | 'far'): Priority {
  return rank(label, dist) <= 1 ? 0 : 2;
}

/** Quiet mode (F5) mutes far non-vehicle alerts; vehicles and near objects still speak. */
export function passesQuietMode(label: string, dist: 'near' | 'far', quiet: boolean): boolean {
  return !quiet || rank(label, dist) <= 1;
}

export interface FrameInfo {
  frameId: number;
  frameTs: number; // monotonic ms when the frame was captured (for stale drops and metrics)
}

/**
 * One utterance per alert, [object] + [direction] + [distance], most urgent first. They share the
 * frameId so the scheduler coalesces them (max 2 per frame).
 */
export function buildAlertUtterances(
  alerts: Alert[],
  frame: FrameInfo,
  lang: Lang,
  opts: { quiet: boolean; newId: () => string },
): Utterance[] {
  return alerts
    .filter((a) => isAlertClass(a.track.label) && passesQuietMode(a.track.label, a.track.dist, opts.quiet))
    .sort((a, b) => rank(a.track.label, a.track.dist) - rank(b.track.label, b.track.dist))
    .map((a) => {
      const t = a.track;
      return {
        id: opts.newId(),
        priority: schedulerPriority(t.label, t.dist),
        source: 'reflex' as const,
        lang,
        createdAt: frame.frameTs,
        frameId: frame.frameId,
        parts: [
          { kind: 'clip' as const, key: ALERT_CLASSES[t.label as keyof typeof ALERT_CLASSES] as ClipKey },
          { kind: 'clip' as const, key: `dir.${t.dir}` as ClipKey },
          { kind: 'clip' as const, key: `dist.${t.dist}` as ClipKey },
        ],
      };
    });
}
