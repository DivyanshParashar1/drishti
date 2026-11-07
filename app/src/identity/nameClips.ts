import type { Lang } from '../core/lang';
import type { TtsResult } from '../net/ttsClient';
import { NAME_TEMPLATE } from './identifier';
import type { IdentityStore } from './store';

export interface NameClipDeps {
  store: Pick<IdentityStore, 'people' | 'setClip'>;
  tts(text: string, lang: Lang): Promise<TtsResult>;
  /** Write the MP3 for (person, lang) and return its file uri. */
  writeClip(personId: number, lang: Lang, mp3: ArrayBuffer): Promise<string>;
  online(): boolean | null;
}

/**
 * Name clips (F4): "{name} aapke saamne hai" from Timbre via /tts, one file per person and
 * language. Until a clip exists the name is spoken with expo-speech (nameParts' fallback).
 *
 * sync(lang) fetches every missing clip for that language, one at a time, and stops at the first
 * failure (usually no network); the next sync retries. It runs after an enrollment, when the
 * connection comes back, and (P11) after a language switch. Calls during a run are queued.
 */
export class NameClipSync {
  private running: Promise<void> | null = null;
  private queued = new Set<Lang>();
  lastError: string | null = null;

  constructor(private readonly d: NameClipDeps) {}

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
      await this.syncOne(lang);
    }
  }

  private async syncOne(lang: Lang): Promise<void> {
    if (this.d.online() === false) return;
    for (const p of [...this.d.store.people]) {
      if (p.clips[lang]) continue;
      if (!this.d.store.people.some((q) => q.id === p.id)) continue; // deleted meanwhile
      const r = await this.d.tts(NAME_TEMPLATE[lang](p.name), lang);
      if (!r.ok) {
        this.lastError = r.code;
        return;
      }
      const uri = await this.d.writeClip(p.id, lang, r.mp3);
      if (!this.d.store.people.some((q) => q.id === p.id)) continue; // deleted while fetching
      await this.d.store.setClip(p.id, lang, uri);
      this.lastError = null;
    }
  }
}
