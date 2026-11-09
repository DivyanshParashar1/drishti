import type { ClipKey } from '../audio/clips.generated';
import type { SchedulerHooks, Utterance } from '../audio/scheduler';
import type { Lang } from '../core/lang';
import type { EventKind, MetricEvent, StageStats } from '../core/metrics';
import type { Signal } from '../core/signal';
import type { DialogPhase } from '../identity/enrollment';
import type { Heard } from '../voice/voiceController';
import { captionFor, tutorialStep, type CaptionText, type Tone } from './captions';
import { motion } from './tokens';

/**
 * F12 demo UI state: what the overlay draws, from what the app actually did. Fed by the speech
 * scheduler (captions, latency), the voice controller (listening, thinking, transcript), the
 * reader, the enrolment dialog and connectivity. Components read `get()` and re-render on
 * `subscribe()`; detection boxes are drawn per frame elsewhere.
 */
export interface Caption extends CaptionText {
  id: string; // metrics id of the utterance playing (answer sentences share one)
  seq: number; // new per played entry
  prev: string | null; // previous answer sentence, dimmed above
  meta: string | null; // "para 2 · chunk 3/5", "First run · 2/7"
  badge: 'consent' | null;
  tutorial: { index: number; total: number } | null;
  speaking: boolean;
  visible: boolean; // false while fading out
}

export interface Latency {
  label: 'ALERT' | 'NAME' | 'ANSWER' | 'READ';
  tone: Tone;
  ms: number; // this event: frame → sound (alert, name), release → first sound (answer, read)
  where: 'on device' | 'cloud';
  p50: number | null;
  p95: number | null;
}

export interface Toast {
  text: string;
  tone: 'offline' | 'online' | 'brand';
  seq: number;
}

export interface HudState {
  caption: Caption | null;
  cut: string | null; // answer cut off by an urgent alert (F6), struck through above the alert
  flash: boolean; // red border on the caption panel when an alert cuts in
  bubble: { text: string; label: string | null } | null; // "You: …  → describe"
  latency: Latency | null;
  toast: Toast | null;
  feedback: 'repeat' | 'stop' | null; // right temple
  lang: Lang;
  langFlash: boolean;
  voice: 'idle' | 'listening' | 'thinking';
  online: boolean | null;
  reading: { chunk: number; chunks: number } | null; // 1-based
  enrol: DialogPhase;
  capture: { startedAt: number; durationMs: number } | null; // F4 countdown ring
  savedAt: number | null; // F4 tick on the box
  pulse: { keys: ClipKey[]; seq: number } | null; // near boxes to pulse once
}

export interface HudDeps {
  scheduler: { subscribe(h: SchedulerHooks): () => void; enqueue(u: Utterance): void };
  metrics: { get(id: string): MetricEvent | undefined; stageStats(kind: EventKind, stage: string): StageStats | null; start(kind: EventKind, stage: string): string };
  voice: {
    state: 'idle' | 'listening' | 'busy';
    thinking: boolean;
    heard: Heard | null;
    onChange(cb: () => void): () => void;
    onGloss(cb: (id: string, text: string, en: string) => void): () => void;
  };
  reader: { state: 'idle' | 'playing' | 'paused'; progress: { chunk: number; chunks: number; block: number }; onChange(cb: () => void): () => void };
  enrollment: { phase: DialogPhase; onChange(cb: () => void): () => void };
  connectivity: { online: boolean | null; onChange(cb: (online: boolean, prev: boolean | null) => void): () => void };
  lang(): Lang;
  langChanged: Pick<Signal<[Lang]>, 'on'>;
  demoChanged: Pick<Signal<[boolean, boolean]>, 'on'>;
  firstRun(): boolean;
  say(key: ClipKey): void;
  captureMs: number;
  now?: () => number;
}

const LATENCY: Partial<Record<EventKind, Pick<Latency, 'label' | 'where'>>> = {
  reflex: { label: 'ALERT', where: 'on device' },
  name: { label: 'NAME', where: 'on device' },
  describe: { label: 'ANSWER', where: 'cloud' },
  reading: { label: 'READ', where: 'on device' },
};

export const FLASH_MS = 1200;
export const SAVED_TICK_MS = 2000;

/** The router's decision as the bubble shows it: "describe", "save \"Priya\"", or null. */
export function commandLabel(cmd: Heard['cmd']): string | null {
  if (cmd === null) return null;
  if (cmd === 'dialog') return 'answer';
  switch (cmd.kind) {
    case 'save':
    case 'delete':
      return cmd.name ? `${cmd.kind} "${cmd.name}"` : cmd.kind;
    case 'quiet':
    case 'demo':
      return `${cmd.kind} ${cmd.on ? 'on' : 'off'}`;
    case 'question':
      return 'ask';
    default:
      return cmd.kind;
  }
}

export class HudStore {
  private s: HudState;
  private listeners = new Set<() => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private offs: (() => void)[] = [];
  private seq = 0;
  private lastPlayed: Utterance[] = [];
  private interruptedAnswer: string | null = null;
  private timed = new Set<string>(); // metric ids already shown on the latency card
  private heardSeq = 0;
  private langLoaded = false;
  private readonly now: () => number;

  constructor(private readonly d: HudDeps) {
    this.now = d.now ?? (() => performance.now());
    this.s = {
      caption: null,
      cut: null,
      flash: false,
      bubble: null,
      latency: null,
      toast: null,
      feedback: null,
      lang: d.lang(),
      langFlash: false,
      voice: 'idle',
      online: d.connectivity.online,
      reading: null,
      enrol: d.enrollment.phase,
      capture: null,
      savedAt: null,
      pulse: null,
    };
    this.offs.push(
      d.scheduler.subscribe({ onPlay: (m) => this.onPlay(m), onEnd: (u, r) => this.onEnd(u, r) }),
      d.voice.onChange(() => this.onVoice()),
      d.voice.onGloss((id, text, en) => this.onGloss(id, text, en)),
      d.reader.onChange(() => this.set({ reading: d.reader.state === 'idle' ? null : this.s.reading })),
      d.enrollment.onChange(() => this.onEnrol()),
      d.connectivity.onChange((online, prev) => {
        this.set({ online });
        if (prev !== null && prev !== online) {
          this.toast(online ? { text: 'Internet is back', tone: 'online' } : { text: 'Internet lost. Alerts are still on.', tone: 'offline' }, motion.toast);
        }
      }),
      d.langChanged.on((lang) => {
        const changed = this.langLoaded && lang !== this.s.lang;
        this.langLoaded = true;
        this.set({ lang, langFlash: changed });
        if (changed) this.after('langFlash', motion.langChipFlash, () => this.set({ langFlash: false }));
      }),
      d.demoChanged.on((on, byUser) => {
        if (byUser) this.toast({ text: on ? 'Demo mode on' : 'Demo mode off', tone: 'brand' }, motion.modeToast);
      }),
    );
  }

  get = (): HudState => this.s;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  dispose(): void {
    for (const off of this.offs) off();
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  /** Right temple, tap: say the last thing again (as a non-urgent line; not timed). */
  repeatLast(): void {
    this.feedback('repeat');
    if (this.lastPlayed.length === 0) return this.d.say('sys.nothing_to_repeat');
    for (const m of this.lastPlayed) {
      this.d.scheduler.enqueue({ ...m, id: this.d.metrics.start('system', 'repeat'), priority: 3, createdAt: this.now(), frameId: undefined });
    }
  }

  /** Right temple, double-tap: show "■ STOP" (the caller stops the speech). */
  feedback(kind: 'repeat' | 'stop'): void {
    this.set({ feedback: kind });
    this.after('feedback', motion.feedback, () => this.set({ feedback: null }));
  }

  private onPlay(members: readonly Utterance[]) {
    const lang = this.s.lang;
    const text = captionFor(members, lang);
    const first = members[0];
    const prevCap = this.s.caption;
    this.lastPlayed = [...members];
    this.clear('hide', 'clearCaption', 'bubble');

    let prev: string | null = null;
    if (text.source === 'answer' && prevCap?.source === 'answer' && prevCap.id === first.id && prevCap.key !== 'sys.looking') {
      prev = prevCap.line1; // streaming: the sentence before stays, dimmed
    }
    let meta: string | null = null;
    const patch: Partial<HudState> = {};
    if (text.source === 'reading') {
      const p = this.d.reader.progress;
      meta = `para ${p.block + 1} · chunk ${p.chunk + 1}/${p.chunks}`;
      patch.reading = { chunk: p.chunk + 1, chunks: p.chunks };
    }
    const step = tutorialStep(text.key);
    if (step) meta = `${this.d.firstRun() ? 'First run' : 'Help'} · ${step.index}/${step.total}`;
    if (text.key === 'sys.saved') patch.savedAt = this.now();

    // F6 demo moment: an urgent alert cut the answer off.
    if (text.source === 'alert' && this.interruptedAnswer) {
      patch.cut = this.interruptedAnswer;
      patch.flash = true;
      this.after('flash', FLASH_MS, () => this.set({ flash: false }));
    } else {
      patch.cut = null;
      patch.flash = false;
    }
    this.interruptedAnswer = null;
    if (text.urgent.length) patch.pulse = { keys: text.urgent, seq: ++this.seq };

    patch.latency = this.latencyFor(members, text.tone) ?? this.s.latency;
    patch.caption = {
      ...text,
      id: first.id,
      seq: ++this.seq,
      prev,
      meta,
      badge: text.key === 'sys.consent' ? 'consent' : null,
      tutorial: step,
      speaking: true,
      visible: true,
    };
    this.set(patch);
  }

  private onEnd(u: Utterance, reason: string) {
    const c = this.s.caption;
    if (!c || c.id !== u.id) return;
    if (reason === 'interrupted' && c.source === 'answer') this.interruptedAnswer = c.line1;
    this.set({ caption: { ...c, speaking: false } });
    // Captions stay 6 s after speech ends, then fade; the bubble goes with them.
    this.after('hide', motion.captionHold, () => {
      if (this.s.caption) this.set({ caption: { ...this.s.caption, visible: false } });
      this.after('clearCaption', motion.captionOut, () => this.set({ caption: null, cut: null, bubble: null, flash: false }));
    });
  }

  private onVoice() {
    const v = this.d.voice;
    const voice = v.state === 'listening' ? 'listening' : v.thinking ? 'thinking' : 'idle';
    const patch: Partial<HudState> = { voice };
    if (voice === 'listening') patch.bubble = null;
    if (v.heard && v.heard.seq !== this.heardSeq) {
      this.heardSeq = v.heard.seq;
      patch.bubble = { text: v.heard.text, label: commandLabel(v.heard.cmd) };
      // Goes with the caption that follows; on its own (e.g. "ruko") after the caption hold.
      this.after('bubble', motion.captionHold, () => this.set({ bubble: null }));
    }
    this.set(patch);
  }

  private onGloss(id: string, text: string, en: string) {
    const c = this.s.caption;
    if (c && c.id === id && c.line1 === text && this.s.lang !== 'en') this.set({ caption: { ...c, line2: en } });
  }

  private onEnrol() {
    const phase = this.d.enrollment.phase;
    const capture = phase === 'capturing' ? (this.s.capture ?? { startedAt: this.now(), durationMs: this.d.captureMs }) : null;
    this.set({ enrol: phase, capture });
  }

  private latencyFor(members: readonly Utterance[], tone: Tone): Latency | null {
    for (const m of members) {
      if (this.timed.has(m.id)) continue;
      const e = this.d.metrics.get(m.id);
      const kind = e && LATENCY[e.kind];
      const ms = e?.stages.play_start;
      if (!e || !kind || ms === undefined) continue;
      this.timed.add(m.id);
      if (this.timed.size > 200) this.timed.delete(this.timed.values().next().value as string);
      const stats = this.d.metrics.stageStats(e.kind, 'play_start');
      const t: Tone = kind.label === 'ANSWER' ? 'brand' : kind.label === 'READ' ? 'white' : tone;
      return { ...kind, tone: t, ms, p50: stats?.p50 ?? null, p95: stats?.p95 ?? null };
    }
    return null;
  }

  private toast(t: Omit<Toast, 'seq'>, ms: number) {
    this.set({ toast: { ...t, seq: ++this.seq } });
    this.after('toast', ms, () => this.set({ toast: null }));
  }

  private after(name: string, ms: number, fn: () => void) {
    this.clear(name);
    this.timers.set(
      name,
      setTimeout(() => {
        this.timers.delete(name);
        fn();
      }, ms),
    );
  }

  private clear(...names: string[]) {
    for (const n of names) {
      const t = this.timers.get(n);
      if (t) clearTimeout(t);
      this.timers.delete(n);
    }
  }

  private set(patch: Partial<HudState>) {
    this.s = { ...this.s, ...patch };
    for (const l of [...this.listeners]) l();
  }
}
