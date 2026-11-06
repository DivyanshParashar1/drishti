import { VISION, type VisionConfig } from './config';
import { iou } from './decode';
import { direction, distance } from './geometry';
import type { Box, Detection, Direction, Distance } from './types';

/**
 * F2 tracking and de-duplication.
 *
 * - Greedy matching across frames: same class and IoU > 0.3, best pairs first.
 * - A track is announced once when it appears. It is re-announced only when it goes far → near,
 *   changes direction third, or was gone > 3 s and comes back (it is forgotten after 3 s, so it
 *   returns as a new track).
 * - Per-class cooldown: at most one alert per class per 4 s, unless the object is near and was
 *   not already announced as near (safety first). A change held back by the cooldown is spoken
 *   when the cooldown ends, if it still applies (the user should hear where things are now).
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
  announced: { dir: Direction; dist: Distance } | null;
}

export type AlertReason = 'new' | 'near' | 'direction';

export interface Alert {
  track: Track;
  reason: AlertReason;
}

export interface TrackUpdate {
  visible: Track[]; // tracks matched or created this frame (for the overlay)
  alerts: Alert[];
}

type TrackerConfig = Pick<VisionConfig, 'trackIou' | 'trackTtlMs' | 'classCooldownMs' | 'nearHeight' | 'nearBottom' | 'directionHysteresis'>;

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
          announced: null,
        };
        this.tracks.push(t);
      }
      visible.push(t);
      const reason = this.reasonToAnnounce(t);
      if (reason && this.passesCooldown(t, now)) {
        alerts.push({ track: { ...t }, reason });
        this.lastClassAlert.set(t.label, now);
        t.announced = { dir: t.dir, dist: t.dist };
      }
    });
    return { visible, alerts };
  }

  private reasonToAnnounce(t: Track): AlertReason | null {
    const a = t.announced;
    if (!a) return 'new';
    if (t.dist === 'near' && a.dist === 'far') return 'near';
    if (t.dir !== a.dir) return 'direction';
    return null;
  }

  private passesCooldown(t: Track, now: number): boolean {
    const nearNews = t.dist === 'near' && t.announced?.dist !== 'near';
    if (nearNews) return true;
    const last = this.lastClassAlert.get(t.label);
    return last === undefined || now - last >= this.cfg.classCooldownMs;
  }
}
