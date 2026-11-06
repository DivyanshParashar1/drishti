import { SPEECH_LOCALE, type Lang } from '../core/lang';
import { CLIPS } from './clips.generated';
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

export type Step =
  | { kind: 'source'; source: number | string }
  | { kind: 'speak'; text: string }
  | { kind: 'pause'; ms: number };

/**
 * Turn utterance parts into playback steps. A clip with no generated audio is spoken from its
 * text. Neighbouring spoken pieces merge into one TTS call so the fallback sounds like one
 * sentence ("Car left mein paas, Kursi aage") instead of separate words with gaps.
 */
export function toSteps(parts: AudioPart[], lang: Lang): Step[] {
  const raw: Step[] = parts.map((p): Step => {
    switch (p.kind) {
      case 'clip': {
        const clip = CLIPS[lang][p.key];
        return clip.asset !== null ? { kind: 'source', source: clip.asset } : { kind: 'speak', text: clip.text };
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

  constructor(private readonly backend: AudioBackend) {}

  async play(parts: AudioPart[], lang: Lang): Promise<PlayOutcome> {
    const gen = ++this.generation;
    for (const step of toSteps(parts, lang)) {
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
    await this.backend.stop();
  }

  /** Preload every generated clip of a language pack so the first alert starts instantly. */
  async preloadPack(lang: Lang): Promise<number> {
    const assets = Object.values(CLIPS[lang])
      .map((c) => c.asset)
      .filter((a): a is number => a !== null);
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
