import { SPEECH_LOCALE, type Lang } from '../core/lang';
import { CLIPS, type ClipKey } from './clips.generated';
import type { AudioPart, PlayOutcome, Player } from './scheduler';

/** The native side, kept thin so ClipPlayer's sequencing can be tested with a fake. */
export interface AudioBackend {
  /** Play a bundled asset (require id) or a file URI to the end. */
  playSource(source: number | string): Promise<PlayOutcome>;
  /** Speak text with the system TTS (offline fallback, D12). */
  speak(text: string, locale: string): Promise<PlayOutcome>;
  /** Stop whatever is sounding now; pending playSource/speak resolve 'stopped'. */
  stop(): Promise<void>;
  preload(source: number | string): Promise<void>;
}

/** A Timbre file saved at run time for a phrase with no bundled clip (PhraseCache). */
export type PhraseLookup = (lang: Lang, key: ClipKey) => string | undefined;

/** Timbre audio for a whole line, fetched live (demo mode, liveTts.ts); null if not available in time. */
export type LiveLookup = (text: string, lang: Lang) => Promise<string | null>;

export type Step =
  | { kind: 'source'; source: number | string }
  | { kind: 'speak'; text: string }
  | { kind: 'pause'; ms: number };

/**
 * Turn utterance parts into playback steps. A clip with no generated audio is spoken from its
 * text. Neighbouring spoken pieces merge into one TTS call so the fallback sounds like one
 * sentence ("Car left mein paas, Kursi aage") instead of separate words with gaps.
 */
export function toSteps(parts: AudioPart[], lang: Lang, lookup?: PhraseLookup, allText = false): Step[] {
  const raw: Step[] = parts.map((p): Step => {
    switch (p.kind) {
      case 'clip': {
        const clip = CLIPS[lang][p.key];
        if (allText) return { kind: 'speak', text: clip.text }; // live Timbre: the whole line as text
        if (clip.asset !== null) return { kind: 'source', source: clip.asset };
        const saved = lookup?.(lang, p.key);
        return saved ? { kind: 'source', source: saved } : { kind: 'speak', text: clip.text };
      }
      case 'file':
        return { kind: 'source', source: p.uri };
      case 'speak':
        return { kind: 'speak', text: p.text };
      case 'pause':
        return { kind: 'pause', ms: p.ms };
    }
  });
  const out: Step[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    const prev = out[out.length - 1];
    if (s.kind === 'speak' && prev?.kind === 'speak') {
      prev.text = `${prev.text} ${s.text}`;
    } else if (s.kind === 'pause' && prev?.kind === 'speak' && raw[i + 1]?.kind === 'speak') {
      prev.text = `${prev.text},`; // a pause between two spoken pieces becomes a comma
    } else {
      out.push(s.kind === 'speak' ? { ...s } : s);
    }
  }
  return out;
}

export class ClipPlayer implements Player {
  private generation = 0;
  private wakePause: (() => void) | null = null;
  private wakeFetch: (() => void) | null = null;

  constructor(
    private readonly backend: AudioBackend,
    private readonly lookup?: PhraseLookup,
    private readonly live?: LiveLookup,
  ) {}

  async play(parts: AudioPart[], lang: Lang): Promise<PlayOutcome> {
    const gen = ++this.generation;
    let steps: Step[] | null = null;
    if (this.live) {
      // Demo mode: every spoken run (clips merged into one sentence, plain text) as live Timbre.
      // If any piece can't be had in time, the whole line plays the normal way.
      const live = toSteps(parts, lang, undefined, true);
      const fetched = Promise.all(live.map((s) => (s.kind === 'speak' ? this.live!(s.text, lang) : Promise.resolve(''))));
      // stop() must not wait for the network (a hazard interrupts within 50 ms).
      const stopped = new Promise<null>((resolve) => (this.wakeFetch = () => resolve(null)));
      const uris = await Promise.race([fetched, stopped]);
      this.wakeFetch = null;
      if (uris === null || gen !== this.generation) return 'stopped';
      if (uris.every((u) => u !== null)) steps = live.map((s, i) => (s.kind === 'speak' ? { kind: 'source', source: uris[i]! } : s));
    }
    for (const step of steps ?? toSteps(parts, lang, this.lookup)) {
      if (gen !== this.generation) return 'stopped';
      let outcome: PlayOutcome;
      if (step.kind === 'source') outcome = await this.backend.playSource(step.source);
      else if (step.kind === 'speak') outcome = await this.backend.speak(step.text, SPEECH_LOCALE[lang]);
      else outcome = await this.pause(step.ms);
      if (outcome === 'stopped' || gen !== this.generation) return 'stopped';
    }
    return 'done';
  }

  async stop(): Promise<void> {
    this.generation++;
    this.wakePause?.();
    this.wakeFetch?.();
    await this.backend.stop();
  }

  /** Preload every generated clip of a language pack so the first alert starts instantly. */
  async preloadPack(lang: Lang): Promise<number> {
    const assets = (Object.keys(CLIPS[lang]) as ClipKey[])
      .map((k) => CLIPS[lang][k].asset ?? this.lookup?.(lang, k) ?? null)
      .filter((a): a is number | string => a !== null);
    await Promise.all(assets.map((a) => this.backend.preload(a)));
    return assets.length;
  }

  private pause(ms: number): Promise<PlayOutcome> {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.wakePause = null;
        resolve('done');
      }, ms);
      this.wakePause = () => {
        clearTimeout(t);
        this.wakePause = null;
        resolve('stopped');
      };
    });
  }
}
