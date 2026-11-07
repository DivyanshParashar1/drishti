import type { SpeechScheduler } from '../audio/scheduler';
import { monotonic, type Clock } from '../core/clock';
import type { Lang } from '../core/lang';
import type { Metrics } from '../core/metrics';
import { buildAlertUtterances } from './alerts';
import { VISION } from './config';
import { filterDetections } from './geometry';
import { Tracker, type Track } from './tracker';
import type { FaceObs } from '../identity/identifier';
import type { Detection } from './types';

/** What the frame worklet reports for one processed frame. */
export interface FrameResult {
  frameNo: number;
  detections: Detection[]; // decoded, unfiltered
  faces?: FaceObs[]; // F3: only on frames with a person while faces are on
  frameWidth: number; // upright frame size, for drawing boxes
  frameHeight: number;
  preprocessMs: number; // convert + resize + tensor
  inferMs: number;
  faceMs?: number; // ML Kit + crop/align/embed; −1 when the face step didn't run
  totalMs: number; // whole worklet, frame callback → decoded (and faces)
}

export interface LaneStats {
  frames: number;
  lastInferMs: number;
  lastTotalMs: number;
  lastFaceMs: number; // last frame the face step ran (−1: not yet)
  faces: number; // faces on the last frame the face step ran
  detectionsPerSec: number;
}

/** F3 hook: sees every frame's faces with the visible tracks (see FaceIdentifier.update). */
export interface FaceSink {
  update(faces: FaceObs[], visible: readonly Track[], frame: { frameId: number; frameTs: number }, now: number): void;
}

/**
 * The JS-thread half of the Reflex lane (F1/F2): filter → track → alert utterances → scheduler,
 * with reflex metrics (§8): frame_ts, detect_done, enqueued, play_start (marked by the scheduler).
 *
 * frame_ts is backdated by the worklet's own processing time, measured on the worklet thread; the
 * camera's capture-to-callback delay is not included (frame timestamps use another clock).
 */
export class ReflexLane {
  readonly tracker = new Tracker();
  quiet = false;
  lang: Lang;
  visible: Track[] = [];
  frameSize = { width: 0, height: 0 };
  stats: LaneStats = { frames: 0, lastInferMs: 0, lastTotalMs: 0, lastFaceMs: -1, faces: 0, detectionsPerSec: 0 };
  faces?: FaceSink;
  private frameTimes: number[] = [];
  private listeners: (() => void)[] = [];

  constructor(
    private readonly scheduler: Pick<SpeechScheduler, 'enqueue'>,
    private readonly metrics: Metrics,
    lang: Lang,
    private readonly clock: Clock = monotonic,
  ) {
    this.lang = lang;
  }

  /** Quiet mode (F5): mute far non-vehicle alerts. Wired to a voice command in P7. */
  setQuiet(on: boolean): void {
    this.quiet = on;
  }

  onUpdate(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  handle(r: FrameResult): void {
    const now = this.clock();
    const frameTs = now - r.totalMs;
    const { visible, alerts } = this.tracker.update(filterDetections(r.detections, VISION), now);
    this.visible = visible;
    this.frameSize = { width: r.frameWidth, height: r.frameHeight };
    this.updateStats(now, r);

    const utterances = buildAlertUtterances(alerts, { frameId: r.frameNo, frameTs }, this.lang, {
      quiet: this.quiet,
      newId: () => {
        const id = this.metrics.start('reflex', 'frame_ts', frameTs);
        this.metrics.mark(id, 'detect_done', now);
        return id;
      },
    });
    for (const u of utterances) {
      this.metrics.mark(u.id, 'enqueued');
      this.scheduler.enqueue(u);
    }
    // After the hazard alerts, so a P1 name never queues ahead of this frame's alerts.
    this.faces?.update(r.faces ?? [], visible, { frameId: r.frameNo, frameTs }, now);
    for (const l of this.listeners) l();
  }

  private updateStats(now: number, r: FrameResult) {
    this.frameTimes.push(now);
    while (this.frameTimes.length && now - this.frameTimes[0] > 2000) this.frameTimes.shift();
    const span = (now - this.frameTimes[0]) / 1000;
    const ran = r.faceMs !== undefined && r.faceMs >= 0;
    this.stats = {
      frames: this.stats.frames + 1,
      lastInferMs: r.inferMs,
      lastTotalMs: r.totalMs,
      lastFaceMs: ran ? r.faceMs! : this.stats.lastFaceMs,
      faces: ran ? (r.faces?.length ?? 0) : this.stats.faces,
      detectionsPerSec: span > 0 ? (this.frameTimes.length - 1) / span : 0,
    };
  }
}
