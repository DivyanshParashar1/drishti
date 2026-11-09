import { monotonic, type Clock } from './clock';

/**
 * Per-event stage timestamps (spec §8) with a rolling window and p50/p95 per stage.
 *
 * An event starts at its first stage (frame_ts for reflex, ptt_release for describe) and every
 * later mark is stored as ms since that start, so durations never mix clocks. Server timings from
 * /ask `done` are attached as-is under `server`.
 */
export type EventKind = 'reflex' | 'name' | 'describe' | 'reading' | 'system';

export interface MetricEvent {
  id: string;
  kind: EventKind;
  startedAt: number; // monotonic ms
  stages: Record<string, number>; // stage → ms since start
  server?: Record<string, number>;
  note?: string; // short code only (e.g. "dropped_stale"); never transcripts or names
}

export interface StageStats {
  n: number;
  p50: number;
  p95: number;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
}

export class Metrics {
  private events: MetricEvent[] = [];
  private byId = new Map<string, MetricEvent>();
  private seq = 0;

  constructor(
    private readonly window = 200,
    private readonly clock: Clock = monotonic,
  ) {}

  /** Start an event; `at` lets a stage that happened earlier (e.g. frame capture) be the start. */
  start(kind: EventKind, firstStage: string, at: number = this.clock()): string {
    const id = `${kind[0]}${++this.seq}`;
    const e: MetricEvent = { id, kind, startedAt: at, stages: { [firstStage]: 0 } };
    this.events.push(e);
    this.byId.set(id, e);
    if (this.events.length > this.window) {
      const old = this.events.shift()!;
      this.byId.delete(old.id);
    }
    return id;
  }

  /** Record a stage once; later marks of the same stage are ignored. Unknown ids are ignored. */
  mark(id: string, stage: string, at: number = this.clock()): void {
    const e = this.byId.get(id);
    if (e && !(stage in e.stages)) e.stages[stage] = Math.round((at - e.startedAt) * 10) / 10;
  }

  attachServer(id: string, timings: Record<string, number>): void {
    const e = this.byId.get(id);
    if (e) e.server = { ...timings };
  }

  note(id: string, code: string): void {
    const e = this.byId.get(id);
    if (e) e.note = code;
  }

  /** Re-file an event under another kind (e.g. a voice command that turned out to be reading). */
  setKind(id: string, kind: EventKind): void {
    const e = this.byId.get(id);
    if (e) e.kind = kind;
  }

  /** p50/p95 of one stage for one kind over the window, or null if no event has it yet. */
  stageStats(kind: EventKind, stage: string): StageStats | null {
    const v: number[] = [];
    for (const e of this.events) if (e.kind === kind && stage in e.stages) v.push(e.stages[stage]);
    return v.length ? { n: v.length, p50: percentile(v, 50), p95: percentile(v, 95) } : null;
  }

  get(id: string): MetricEvent | undefined {
    return this.byId.get(id);
  }

  /** p50/p95 of each stage's offset from the event start, per kind. */
  summary(): Record<string, Record<string, StageStats>> {
    const values: Record<string, Record<string, number[]>> = {};
    for (const e of this.events) {
      const k = (values[e.kind] ??= {});
      for (const [stage, ms] of Object.entries(e.stages)) {
        if (ms === 0 && Object.keys(e.stages)[0] === stage) continue; // the start itself
        (k[stage] ??= []).push(ms);
      }
    }
    const out: Record<string, Record<string, StageStats>> = {};
    for (const [kind, stages] of Object.entries(values)) {
      out[kind] = {};
      for (const [stage, v] of Object.entries(stages)) {
        out[kind][stage] = { n: v.length, p50: percentile(v, 50), p95: percentile(v, 95) };
      }
    }
    return out;
  }

  /** The session's events as JSON for the share sheet (write-up numbers). */
  exportJson(): string {
    return JSON.stringify({ exportedAt: new Date().toISOString(), events: this.events, summary: this.summary() }, null, 1);
  }
}
