import type { Lang } from '../core/lang';
import type { TtsResult } from '../net/ttsClient';

/**
 * DEMO ONLY (10 Nov 2026 video): every spoken line goes through Gnani Timbre as a whole sentence
 * ("Kursi aage, paas" in one voice, not three stitched words; names, lists and fallbacks too,
 * instead of the phone's voice). Revert to false after the demo, once a proper offline pack is
 * bundled. When Timbre can't answer (offline, slow, rate-limited), playback falls back to the
 * normal path: saved phrase files, then expo-speech.
 */
export const TIMBRE_EVERYTHING = true;

/** Longest wait for a live line before falling back (an alert must not hang). */
export const LIVE_TIMEOUT_MS = 4000;

export interface LiveTtsDeps {
  tts(text: string, lang: Lang, timeoutMs: number): Promise<TtsResult>;
  /** Save one line's MP3 (cache dir) and return its file uri. */
  write(name: string, mp3: ArrayBuffer): Promise<string>;
  online(): boolean | null;
}

/** Stable short file name for a line: lang + a 32-bit hash of the text + its length. */
export function liveName(lang: Lang, text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${lang}-${(h >>> 0).toString(16)}-${text.length}`;
}

/**
 * Timbre audio for any line, fetched when first spoken and kept for the session (same text →
 * same file, so a repeated alert starts instantly). Returns null when it can't be had in time.
 */
export class LiveTts {
  private cache = new Map<string, Promise<string | null>>();

  constructor(
    private readonly d: LiveTtsDeps,
    private readonly timeoutMs = LIVE_TIMEOUT_MS,
  ) {}

  get(text: string, lang: Lang): Promise<string | null> {
    const t = text.trim();
    if (!t) return Promise.resolve(null);
    const k = `${lang}|${t}`;
    const hit = this.cache.get(k);
    if (hit) return hit;
    if (this.d.online() === false) return Promise.resolve(null);
    const p = this.fetch(t, lang).then((uri) => {
      if (!uri) this.cache.delete(k); // try again next time
      return uri;
    });
    this.cache.set(k, p);
    return p;
  }

  private async fetch(text: string, lang: Lang): Promise<string | null> {
    try {
      const r = await this.d.tts(text, lang, this.timeoutMs);
      if (!r.ok) return null;
      return await this.d.write(liveName(lang, text), r.mp3);
    } catch {
      return null;
    }
  }
}
