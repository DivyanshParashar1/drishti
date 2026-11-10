import { VISION, type VisionConfig } from './config';
import { iou } from './decode';
import { direction, distance } from './geometry';
import type { Box, Detection, Direction, Distance } from './types';

/**
 * F2 tracking and de-duplication.
 *
 * - Greedy matching across frames: same class and IoU > 0.3, best pairs first.
 * - A track is announced once when it appears ("Kursi aage, door"), and once more when it turns
 *   near ("Kursi aage, paas"): walking towards an object is what the user must hear. It is
 *   forgotten after 3 s unseen, so an object that comes back is announced again.
 * - Per-class cooldown: a new object of a class announced in the last 4 s is not announced at
 *   all (the user just heard that word); it counts as announced, so it isn't said later either.
 *   Turning near always bypasses the cooldown (safety first).
 * - Direction changes are tracked (with hysteresis) but not re-announced.
 */
export interface Track {
  id: number;
  label: string;
  score: number;
  box: Box;
  dir: Direction;
  dist: Distance;
  firstSeen: number;
  lastSeen: number;
  announced: boolean;
  announcedNear: boolean;
}

export type AlertReason = 'new' | 'near';

export interface Alert {
  track: Track;
  reason: AlertReason;
}

export interface TrackUpdate {
  visible: Track[]; // tracks matched or created this frame (for the overlay)
  alerts: Alert[];
}

type TrackerConfig = Pick<VisionConfig, 'trackIou' | 'trackTtlMs' | 'classCooldownMs' | 'directionHysteresis' | 'nearHeight' | 'nearBottom'>;

export class Tracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private lastClassAlert = new Map<string, number>();

  constructor(private readonly cfg: TrackerConfig = VISION) {}

  get all(): readonly Track[] {
    return this.tracks;
  }

  reset(): void {
    this.tracks = [];
    this.lastClassAlert.clear();
  }

  update(dets: Detection[], now: number): TrackUpdate {
    this.tracks = this.tracks.filter((t) => now - t.lastSeen <= this.cfg.trackTtlMs);

    // Greedy matching: all same-class pairs above the IoU threshold, best first.
    const pairs: { t: Track; d: number; iou: number }[] = [];
    dets.forEach((det, d) => {
      for (const t of this.tracks) {
        if (t.label !== det.label) continue;
        const v = iou(t.box, det.box);
        if (v > this.cfg.trackIou) pairs.push({ t, d, iou: v });
      }
    });
    pairs.sort((a, b) => b.iou - a.iou);
    const usedTracks = new Set<Track>();
    const matchOf = new Map<number, Track>();
    for (const p of pairs) {
      if (usedTracks.has(p.t) || matchOf.has(p.d)) continue;
      usedTracks.add(p.t);
      matchOf.set(p.d, p.t);
    }

    const visible: Track[] = [];
    const alerts: Alert[] = [];
    dets.forEach((det, d) => {
      let t = matchOf.get(d);
      if (t) {
        t.box = det.box;
        t.score = det.score;
        t.dir = direction(det.box, t.dir, this.cfg.directionHysteresis);
        t.dist = distance(det.box, this.cfg);
        t.lastSeen = now;
      } else {
        t = {
          id: this.nextId++,
          label: det.label,
          score: det.score,
          box: det.box,
          dir: direction(det.box, undefined, this.cfg.directionHysteresis),
          dist: distance(det.box, this.cfg),
          firstSeen: now,
          lastSeen: now,
          announced: false,
          announcedNear: false,
        };
        this.tracks.push(t);
      }
      visible.push(t);
      if (!t.announced) {
        t.announced = true;
        t.announcedNear = t.dist === 'near';
        const last = this.lastClassAlert.get(t.label);
        if (t.dist === 'near' || last === undefined || now - last >= this.cfg.classCooldownMs) {
          alerts.push({ track: { ...t }, reason: 'new' });
          this.lastClassAlert.set(t.label, now);
        }
      } else if (t.dist === 'near' && !t.announcedNear) {
        t.announcedNear = true;
        alerts.push({ track: { ...t }, reason: 'near' });
        this.lastClassAlert.set(t.label, now);
      }
    });
    return { visible, alerts };
  }
}
