import type { AudioPart, SpeechScheduler, Utterance } from '../audio/scheduler';
import { monotonic, type Clock } from '../core/clock';
import type { Lang } from '../core/lang';
import type { Metrics } from '../core/metrics';
import type { Track } from '../vision/tracker';
import type { Box, Direction } from '../vision/types';
import { IDENTITY, type IdentityConfig } from './config';
import { matchFace, type KnownPerson, type Match } from './matcher';

/** One face from the frame worklet. Only faces ≥ minFacePx wide carry an embedding. */
export interface FaceObs {
  box: Box; // normalised, upright frame
  widthPx: number;
  embedding: number[] | null; // unit length, 128-d
}

export interface NamedPerson extends KnownPerson {
  clips?: Partial<Record<Lang, string>>;
}

type Decision = { kind: 'name'; personId: number; name: string } | { kind: 'unknown' } | null;

interface TrackState {
  votes: (number | null)[]; // matched personId per embedded face frame, newest last
  decision: Decision;
  last: Match | null;
  unknownSaid: boolean;
}

interface IdentityState {
  lastSeen: number;
  announced: boolean;
  pending: string | null; // utterance id waiting in the scheduler
}

export interface FaceLogEntry {
  t: number;
  track: number;
  widthPx: number;
  best: string | null;
  sim: number;
  second: number;
  named: string | null;
}

/** Spoken fallback until a Timbre name clip exists (P9). The clip says the same thing. */
export const NAME_TEMPLATE: Record<Lang, (name: string) => string> = {
  'hi-en': (n) => `${n} aapke saamne hai`,
  hi: (n) => `${n} आपके सामने है`,
  en: (n) => `${n} is here`,
  ta: (n) => `${n} இருக்கிறார்`,
};

export function nameParts(p: NamedPerson, lang: Lang, dir: Direction): AudioPart[] {
  const text = NAME_TEMPLATE[lang](p.name);
  const en = `${p.name} is ahead of you`; // F12 caption; the direction clip adds its own English
  const uri = p.clips?.[lang];
  return [uri ? { kind: 'file', uri, text, en } : { kind: 'speak', text, en }, { kind: 'clip', key: `dir.${dir}` }];
}

const LOG_MAX = 1000;

export interface CaptureResult {
  embeddings: number[][];
  multiFaceFrames: number;
}

interface Capture {
  opts: { max: number; durationMs: number; minPx: number; minGapMs?: number };
  got: number[][];
  multiFace: number;
  lastAt: number;
  finish: () => void;
}

/**
 * F3 decision layer, fed once per processed frame with the faces and the visible person tracks.
 *
 * - Each face is attached to the smallest person box containing its centre (one face per track).
 * - Per track, the last 5 embedded face frames vote. A name is decided when the same person wins
 *   ≥ 3 of them; "unknown" when 5 in a row have no match. A decided name never changes to another
 *   name on the same track; unknown can still become a name.
 * - A person is announced once per appearance ([name clip] + [direction], P1). "Appearance" ends
 *   after 5 min unseen. If the announcement is dropped as stale or cut by a hazard, it is retried
 *   while the person is still in view; one the user stopped is not.
 * - "Unknown person" is said once per track, at most once per 30 s overall.
 */
export class FaceIdentifier {
  private tracks = new Map<number, TrackState>();
  private ids = new Map<number, IdentityState>();
  private lastUnknownAt = -Infinity;
  private present: { person: NamedPerson; dir: Direction }[] = [];
  private capture: Capture | null = null;
  /** While enrolling (F4), "unknown person" is not announced: that person is being saved. */
  suppressUnknown = false;
  /** Similarity log for threshold calibration (DT-8.1). Names stay on the device. */
  readonly log: FaceLogEntry[] = [];

  constructor(
    private readonly d: {
      scheduler: Pick<SpeechScheduler, 'enqueue' | 'subscribe'>;
      metrics: Metrics;
      lang: () => Lang;
      people: () => readonly NamedPerson[];
    },
    private readonly cfg: IdentityConfig = IDENTITY,
    private readonly clock: Clock = monotonic,
  ) {
    d.scheduler.subscribe({
      // Stale or cut by a hazard → say it again while in view. Stopped/cleared by the user → done.
      onDrop: (u, reason) => (reason === 'stale' ? this.retryLater(u) : this.settle(u)),
      onEnd: (u, reason) => (reason === 'interrupted' || reason === 'error' ? this.retryLater(u) : this.settle(u)),
    });
  }

  /** Track id → decision, for the debug overlay. */
  decisionOf(trackId: number): { label: string; sim: number | null } | null {
    const s = this.tracks.get(trackId);
    if (!s) return null;
    const label = s.decision?.kind === 'name' ? s.decision.name : s.decision?.kind === 'unknown' ? 'unknown' : `${s.votes.length}/5`;
    return { label, sim: s.last ? s.last.sim : null };
  }

  /** Recognised people in view now (who-is-here, and names for /ask). */
  presentPeople(): readonly { person: NamedPerson; dir: Direction }[] {
    return this.present;
  }

  /**
   * F4 capture: embeddings from frames where exactly one face is big enough to embed and it is
   * ≥ `minPx` wide (frames with two such faces are skipped and counted), at least `minGapMs` apart
   * so the frames span the pose. Resolves with what it got after `durationMs`, or at `max`.
   */
  captureFaces(opts: { max: number; durationMs: number; minPx: number; minGapMs?: number }): Promise<CaptureResult> {
    this.capture?.finish();
    return new Promise((resolve) => {
      const c: Capture = {
        opts,
        got: [],
        multiFace: 0,
        lastAt: -Infinity,
        finish: () => {
          clearTimeout(timer);
          if (this.capture === c) this.capture = null;
          resolve({ embeddings: c.got, multiFaceFrames: c.multiFace });
        },
      };
      const timer = setTimeout(() => c.finish(), opts.durationMs);
      this.capture = c;
    });
  }

  reset(): void {
    this.tracks.clear();
    this.present = [];
  }

  update(faces: FaceObs[], visible: readonly Track[], frame: { frameId: number; frameTs: number }, now = this.clock()): void {
    const persons = visible.filter((t) => t.label === 'person');
    const alive = new Set(persons.map((t) => t.id));
    for (const id of this.tracks.keys()) if (!alive.has(id)) this.tracks.delete(id);

    if (this.capture) {
      const c = this.capture;
      const big = faces.filter((x) => x.embedding && x.widthPx >= this.cfg.minFacePx);
      if (big.length > 1) c.multiFace++;
      else if (big.length === 1 && big[0].widthPx >= c.opts.minPx && now - c.lastAt >= (c.opts.minGapMs ?? 0)) {
        c.got.push(big[0].embedding!);
        c.lastAt = now;
      }
      if (c.got.length >= c.opts.max) c.finish();
    }

    const people = this.d.people();
    const assigned = new Set<number>();
    for (const f of [...faces].sort((a, b) => b.widthPx - a.widthPx)) {
      if (!f.embedding || f.widthPx < this.cfg.minFacePx) continue;
      const t = containing(f.box, persons, assigned);
      if (!t) continue;
      assigned.add(t.id);
      const s = this.state(t.id);
      const m = matchFace(f.embedding, people, this.cfg);
      s.last = m;
      s.votes.push(m.personId);
      if (s.votes.length > this.cfg.voteWindow) s.votes.shift();
      this.decide(s);
      this.pushLog({ t: now, track: t.id, widthPx: Math.round(f.widthPx), best: m.bestName, sim: m.sim, second: m.second, named: m.name });
    }

    const present: { person: NamedPerson; dir: Direction }[] = [];
    for (const t of persons) {
      const s = this.tracks.get(t.id);
      if (!s?.decision) continue;
      if (s.decision.kind === 'name') {
        const pid = s.decision.personId;
        const person = people.find((p) => p.id === pid);
        if (!person) {
          s.decision = null; // deleted while in view
          s.votes = [];
          continue;
        }
        present.push({ person, dir: t.dir });
        this.seen(person, t, frame, now);
      } else if (!s.unknownSaid) {
        s.unknownSaid = true; // muted while enrolling counts as said: no "unknown" after "Save ho gaya"
        if (!this.suppressUnknown && now - this.lastUnknownAt >= this.cfg.unknownCooldownMs) {
          this.lastUnknownAt = now;
          this.enqueue(frame, now, [{ kind: 'clip', key: 'sys.unknown_person' }]);
        }
      }
    }
    this.present = present;
  }

  private decide(s: TrackState) {
    if (s.decision?.kind === 'name') return; // a name sticks for the track
    const counts = new Map<number, number>();
    for (const v of s.votes) if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
    for (const [pid, n] of counts) {
      if (n >= this.cfg.votesToName) {
        const name = this.d.people().find((p) => p.id === pid)?.name;
        if (name) s.decision = { kind: 'name', personId: pid, name };
        return;
      }
    }
    if (!s.decision && s.votes.length >= this.cfg.unknownAfter && s.votes.slice(-this.cfg.unknownAfter).every((v) => v === null)) {
      s.decision = { kind: 'unknown' };
    }
  }

  private seen(person: NamedPerson, t: Track, frame: { frameId: number; frameTs: number }, now: number) {
    let id = this.ids.get(person.id);
    if (!id) {
      id = { lastSeen: -Infinity, announced: false, pending: null };
      this.ids.set(person.id, id);
    }
    if (now - id.lastSeen > this.cfg.reannounceMs) id.announced = false; // a new appearance
    id.lastSeen = now;
    if (!id.announced && !id.pending) {
      id.announced = true;
      id.pending = this.enqueue(frame, now, nameParts(person, this.d.lang(), t.dir));
    }
  }

  private enqueue(frame: { frameId: number; frameTs: number }, now: number, parts: AudioPart[]): string {
    const id = this.d.metrics.start('name', 'frame_ts', frame.frameTs);
    this.d.metrics.mark(id, 'match_done', now);
    this.d.metrics.mark(id, 'enqueued', now);
    // P1 (F9): waits for the current utterance, never cuts one. Reflex source → dropped if stale,
    // in which case retryLater() re-arms it for the next frame the person is in view.
    const u: Utterance = { id, priority: 1, source: 'reflex', lang: this.d.lang(), createdAt: frame.frameTs, parts };
    this.d.scheduler.enqueue(u);
    return id;
  }

  private retryLater(u: Utterance) {
    for (const s of this.ids.values()) {
      if (s.pending === u.id) {
        s.pending = null;
        s.announced = false;
      }
    }
  }

  private settle(u: Utterance) {
    for (const s of this.ids.values()) if (s.pending === u.id) s.pending = null;
  }

  private state(trackId: number): TrackState {
    let s = this.tracks.get(trackId);
    if (!s) {
      s = { votes: [], decision: null, last: null, unknownSaid: false };
      this.tracks.set(trackId, s);
    }
    return s;
  }

  private pushLog(e: FaceLogEntry) {
    this.log.push(e);
    if (this.log.length > LOG_MAX) this.log.shift();
  }
}

/** Smallest unassigned person box containing the face centre. */
function containing(face: Box, persons: readonly Track[], taken: Set<number>): Track | null {
  const cx = (face[0] + face[2]) / 2;
  const cy = (face[1] + face[3]) / 2;
  let best: Track | null = null;
  let bestArea = Infinity;
  for (const t of persons) {
    if (taken.has(t.id)) continue;
    const [x1, y1, x2, y2] = t.box;
    if (cx < x1 || cx > x2 || cy < y1 || cy > y2) continue;
    const area = (x2 - x1) * (y2 - y1);
    if (area < bestArea) {
      best = t;
      bestArea = area;
    }
  }
  return best;
}
