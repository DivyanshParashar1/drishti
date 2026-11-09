import { monotonic, type Clock } from '../core/clock';
import type { Lang } from '../core/lang';
import type { ClipKey } from './clips.generated';

/**
 * Speech scheduler (spec F9): one queue for all audio.
 *
 * - Priorities: P0 vehicle/near hazard, P1 identity, P2 other alerts, P3 answers and reading,
 *   P4 confirmations. FIFO within a priority, so answer sentences stay in order.
 * - A new P0 interrupts whatever is playing unless that is also P0. The interrupted utterance is
 *   dropped, not resumed (F6: the user can say "repeat").
 * - P1–P4 never cut a clip: they wait for the current utterance to finish. Answers arrive as one
 *   utterance per sentence, so a name can be announced between two sentences.
 * - Reflex utterances older than 500 ms when they reach the head of the queue are dropped.
 *   Answers, reading and system lines are never dropped as stale.
 * - Reflex alerts from the same frame coalesce into one utterance, at most 2 objects
 *   ("Car left mein, kursi aage"); the 2 highest-priority objects win.
 */

export type Priority = 0 | 1 | 2 | 3 | 4;
export type Source = 'reflex' | 'answer' | 'reading' | 'system';

export type AudioPart =
  | { kind: 'clip'; key: ClipKey } // bundled clip from the language pack
  | { kind: 'file'; uri: string; text: string; en?: string } // answer sentence or name clip; text is the fallback
  | { kind: 'speak'; text: string; en?: string } // expo-speech; en: English caption line (F12)
  | { kind: 'pause'; ms: number };

export interface Utterance {
  id: string; // metrics event id
  priority: Priority;
  source: Source;
  lang: Lang;
  parts: AudioPart[];
  createdAt: number; // monotonic ms; for reflex, the frame time
  frameId?: number; // reflex alerts sharing a frameId coalesce
}

export type PlayOutcome = 'done' | 'stopped';

export interface Player {
  /** Play parts in order; resolves when finished or when stop() cut it short. */
  play(parts: AudioPart[], lang: Lang): Promise<PlayOutcome>;
  /** Stop now (target ≤ 50 ms). The pending play() resolves 'stopped'. */
  stop(): Promise<void>;
}

export type EndReason = 'done' | 'interrupted' | 'stopped' | 'error';
export type DropReason = 'stale' | 'coalesced_out' | 'cleared';

export interface SchedulerHooks {
  /** Fired per member utterance when its audio starts (coalesced members share the start). */
  onStart?(u: Utterance, at: number): void;
  onEnd?(u: Utterance, reason: EndReason): void;
  onDrop?(u: Utterance, reason: DropReason): void;
  /** Once per played entry, with all its members (a coalesced alert is one entry), after onStart. */
  onPlay?(members: readonly Utterance[], at: number): void;
}

export const STALE_MS = 500;
export const MAX_COALESCED = 2;
export const COALESCE_PAUSE_MS = 120;

interface Entry {
  members: Utterance[]; // > 1 only for coalesced reflex alerts
  seq: number;
}

const priorityOf = (e: Entry) => Math.min(...e.members.map((m) => m.priority)) as Priority;

export class SpeechScheduler {
  private queue: Entry[] = [];
  private current: Entry | null = null;
  private currentInterrupted = false;
  private pumping = false;
  private seq = 0;
  private idleListeners: (() => void)[] = [];
  private listeners: SchedulerHooks[] = [];
  private readonly hooks: Required<SchedulerHooks>;

  constructor(
    private readonly player: Player,
    hooks: SchedulerHooks = {},
    private readonly clock: Clock = monotonic,
  ) {
    this.listeners.push(hooks);
    const each =
      <K extends keyof SchedulerHooks>(k: K) =>
      (...args: Parameters<Required<SchedulerHooks>[K]>) => {
        for (const l of this.listeners) (l[k] as ((...a: typeof args) => void) | undefined)?.(...args);
      };
    this.hooks = { onStart: each('onStart'), onEnd: each('onEnd'), onDrop: each('onDrop'), onPlay: each('onPlay') };
  }

  /** Add another set of hooks (e.g. the voice controller watching for interrupted answers). */
  subscribe(hooks: SchedulerHooks): () => void {
    this.listeners.push(hooks);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== hooks);
    };
  }

  /** Drop queued utterances matching `pred` (not the one playing). Returns how many. */
  cancelWhere(pred: (u: Utterance) => boolean): number {
    let n = 0;
    this.queue = this.queue.filter((e) => {
      const hit = e.members.some(pred);
      if (hit) {
        n++;
        for (const m of e.members) this.hooks.onDrop(m, 'cleared');
      }
      return !hit;
    });
    return n;
  }

  enqueue(u: Utterance): void {
    if (!this.coalesce(u)) this.queue.push({ members: [u], seq: ++this.seq });

    if (u.priority === 0 && this.current && priorityOf(this.current) !== 0 && !this.currentInterrupted) {
      this.currentInterrupted = true;
      void this.player.stop();
    }
    void this.pump();
  }

  /** Clear the queue and stop the current utterance ("ruko"). */
  stopAll(): void {
    for (const e of this.queue) for (const m of e.members) this.hooks.onDrop(m, 'cleared');
    this.queue = [];
    if (this.current) void this.player.stop();
  }

  onIdle(cb: () => void): () => void {
    this.idleListeners.push(cb);
    return () => {
      this.idleListeners = this.idleListeners.filter((l) => l !== cb);
    };
  }

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  /** Utterances waiting (coalesced members count once), for the debug overlay and tests. */
  get pending(): Utterance[][] {
    return this.sorted().map((e) => [...e.members]);
  }

  private coalesce(u: Utterance): boolean {
    if (u.source !== 'reflex' || u.frameId === undefined) return false;
    const group = this.queue.find(
      (e) => e.members[0].source === 'reflex' && e.members[0].frameId === u.frameId,
    );
    if (!group) return false;
    if (group.members.length < MAX_COALESCED) {
      group.members.push(u);
    } else {
      // Full: keep the two highest priorities (on a tie, the earlier one stays).
      const worst = group.members.reduce((w, m) => (m.priority >= w.priority ? m : w));
      if (u.priority < worst.priority) {
        group.members = group.members.filter((m) => m !== worst).concat(u);
        this.hooks.onDrop(worst, 'coalesced_out');
      } else {
        this.hooks.onDrop(u, 'coalesced_out');
      }
    }
    group.members.sort((a, b) => a.priority - b.priority);
    return true;
  }

  private sorted(): Entry[] {
    return [...this.queue].sort((a, b) => priorityOf(a) - priorityOf(b) || a.seq - b.seq);
  }

  private takeNext(): Entry | null {
    while (this.queue.length) {
      const next = this.sorted()[0];
      this.queue = this.queue.filter((e) => e !== next);
      const now = this.clock();
      const fresh = next.members.filter((m) => {
        const stale = m.source === 'reflex' && now - m.createdAt > STALE_MS;
        if (stale) this.hooks.onDrop(m, 'stale');
        return !stale;
      });
      if (fresh.length) return { ...next, members: fresh };
    }
    return null;
  }

  private partsOf(e: Entry): AudioPart[] {
    return e.members.flatMap((m, i) =>
      i === 0 ? m.parts : [{ kind: 'pause', ms: COALESCE_PAUSE_MS } as AudioPart, ...m.parts],
    );
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      let entry: Entry | null;
      while ((entry = this.takeNext())) {
        this.current = entry;
        this.currentInterrupted = false;
        const at = this.clock();
        for (const m of entry.members) this.hooks.onStart(m, at);
        this.hooks.onPlay(entry.members, at); // after onStart, so play_start is already marked
        let reason: EndReason;
        try {
          const outcome = await this.player.play(this.partsOf(entry), entry.members[0].lang);
          reason = outcome === 'done' ? 'done' : this.currentInterrupted ? 'interrupted' : 'stopped';
        } catch {
          reason = 'error';
        }
        for (const m of entry.members) this.hooks.onEnd(m, reason);
        this.current = null;
      }
    } finally {
      this.pumping = false;
    }
    for (const cb of this.idleListeners) cb();
  }
}
