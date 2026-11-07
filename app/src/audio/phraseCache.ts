import type { Lang } from '../core/lang';
import type { TtsResult } from '../net/ttsClient';
import { CLIPS, type ClipKey } from './clips.generated';

export interface PhraseCacheDeps {
  tts(text: string, lang: Lang): Promise<TtsResult>;
  /** Save one phrase's MP3 and return its file uri. */
  write(lang: Lang, key: ClipKey, mp3: ArrayBuffer): Promise<string>;
  /** Phrases already saved for a language (key → uri). */
  list(lang: Lang): Promise<Partial<Record<ClipKey, string>>>;
  online(): boolean | null;
}

/** Hazard words first: they're heard most and must sound right soonest. */
const FIRST: readonly string[] = ['obj.', 'dir.', 'dist.', 'sys.unknown_person', 'sys.camera_blocked', 'sys.no_internet', 'sys.internet_', 'sys.looking', 'sys.didnt_hear'];
const rank = (k: string) => {
  const i = FIRST.findIndex((p) => k.startsWith(p));
  return i < 0 ? FIRST.length : i;
};

/**
 * Gnani Timbre audio for every fixed phrase (alerts, directions, system lines), fetched at run
 * time when no clip pack is bundled. Each phrase is fetched once per language over /tts, saved
 * on the phone and played from the file from then on (offline too). Until a phrase is saved it
 * is spoken with expo-speech.
 *
 * sync(lang) fetches every missing phrase for that language, one at a time, hazard words first,
 * about 2.5 s apart (the relay's rate limit is shared), and stops at the first failure (usually no
 * network); the next sync carries on, and a rate-limited run retries itself after a minute. It runs at
 * startup, whenever the connection comes back, and on a language switch.
 */
export class PhraseCache {
  private uris: Partial<Record<Lang, Partial<Record<ClipKey, string>>>> = {};
  private running: Promise<void> | null = null;
  private queued = new Set<Lang>();
  lastError: string | null = null;

  constructor(
    private readonly d: PhraseCacheDeps,
    /** Between fetches: the relay allows 30 requests/min, shared with questions and reading. */
    private readonly gapMs = 2500,
    private readonly retryMs = 60_000,
  ) {}

  /** The saved Timbre file for a phrase, if any. */
  uri(lang: Lang, key: ClipKey): string | undefined {
    return this.uris[lang]?.[key];
  }

  /** How many phrases of a language have Timbre audio (bundled or saved) / total. */
  progress(lang: Lang): { ready: number; total: number } {
    const keys = Object.keys(CLIPS[lang]) as ClipKey[];
    return { ready: keys.filter((k) => CLIPS[lang][k].asset !== null || this.uri(lang, k)).length, total: keys.length };
  }

  async load(lang: Lang): Promise<void> {
    try {
      this.uris[lang] = { ...(await this.d.list(lang)), ...this.uris[lang] };
    } catch {
      this.uris[lang] ??= {};
    }
  }

  sync(lang: Lang): Promise<void> {
    this.queued.add(lang);
    if (!this.running) {
      this.running = this.drain().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async drain(): Promise<void> {
    while (this.queued.size) {
      const [lang] = this.queued;
      this.queued.delete(lang);
      if (!this.uris[lang]) await this.load(lang);
      await this.syncOne(lang);
    }
  }

  private async syncOne(lang: Lang): Promise<void> {
    if (this.d.online() === false) return;
    const missing = (Object.keys(CLIPS[lang]) as ClipKey[])
      .filter((k) => CLIPS[lang][k].asset === null && !this.uri(lang, k))
      .sort((a, b) => rank(a) - rank(b));
    for (const key of missing) {
      const r = await this.d.tts(CLIPS[lang][key].text, lang);
      if (!r.ok) {
        this.lastError = r.code;
        if (r.code === 'rate_limited') setTimeout(() => void this.sync(lang), this.retryMs);
        return;
      }
      try {
        const uri = await this.d.write(lang, key, r.mp3);
        (this.uris[lang] ??= {})[key] = uri;
        this.lastError = null;
        if (this.gapMs > 0) await new Promise((r) => setTimeout(r, this.gapMs));
      } catch {
        this.lastError = 'write_failed';
        return;
      }
    }
  }
}
