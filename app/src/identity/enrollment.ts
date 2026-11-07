import type { ClipKey } from '../audio/clips.generated';
import type { AudioPart } from '../audio/scheduler';
import { consentAnswer, route, spokenName } from '../voice/router';
import { IDENTITY, type IdentityConfig } from './config';
import type { CaptureResult } from './identifier';
import type { IdentityStore } from './store';

export type DialogPhase = 'idle' | 'ask_name' | 'consent' | 'capturing' | 'ask_delete_name';

export interface DialogDeps {
  say(key: ClipKey): void;
  speak(parts: AudioPart[]): void;
  /** F4 capture (5–10 frames, exactly one face ≥ 100 px); see FaceIdentifier.captureFaces. */
  capture(): Promise<CaptureResult>;
  store: Pick<IdentityStore, 'people' | 'find' | 'add' | 'addEmbeddings' | 'remove'>;
  /** Fetch missing name clips for the current language (no-op offline; retried later). */
  syncClips(): void;
  deleteFiles(uris: string[]): Promise<void>;
  /** Mute "unknown person" while someone is being saved. */
  setEnrolling(on: boolean): void;
}

/**
 * F4 voice enrollment, delete and list, as one dialog that takes the next transcripts.
 *
 * save:   [name from the command, or "Naam bataiye" → next transcript (one retry)]
 *         → "Kya aap save hone ke liye raazi hain?" → next transcript must be a clear yes
 *         → "Teen second camera ki taraf dekhiye" → capture → store → "Save ho gaya"
 *         → name clips fetched in the background (expo-speech says the name until then).
 *         Anything but yes, "ruko", or 30 s with no answer → "Theek hai, save nahi kiya".
 *         Fewer than 5 good frames (no face, or two faces) → "Chehra saaf nahi dikha…".
 *         Saving a name that exists adds the new embeddings to that person.
 * delete: name from the command or asked for → person, embeddings and clip files removed →
 *         "Delete ho gaya" / "Ye naam saved nahi hai".
 * list:   "Saved log hain:" + the names, or "Abhi koi saved nahi hai".
 */
export class EnrollmentDialog {
  phase: DialogPhase = 'idle';
  private name: string | null = null;
  private retried = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private listeners: (() => void)[] = [];

  constructor(
    private readonly d: DialogDeps,
    private readonly cfg: IdentityConfig = IDENTITY,
  ) {}

  /** True while the next transcript is an answer for the dialog, not a new command. */
  get wantsTranscript(): boolean {
    return this.phase === 'ask_name' || this.phase === 'consent' || this.phase === 'ask_delete_name';
  }

  onChange(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  save(name: string | null): void {
    this.end();
    this.d.setEnrolling(true);
    if (name) {
      this.name = name;
      this.toConsent();
    } else {
      this.ask('ask_name');
    }
  }

  async delete(name: string | null): Promise<void> {
    this.end();
    if (name) return this.doDelete(name);
    this.ask('ask_delete_name');
  }

  list(): void {
    this.end();
    const names = this.d.store.people.map((p) => p.name);
    if (names.length === 0) return this.d.say('sys.no_one_saved');
    this.d.speak([{ kind: 'clip', key: 'sys.saved_list' }, { kind: 'speak', text: names.join(', ') }]);
  }

  /** The next transcript while `wantsTranscript`. */
  async onTranscript(text: string): Promise<void> {
    if (!this.wantsTranscript) return;
    if (route(text).kind === 'stop') return this.cancel();
    switch (this.phase) {
      case 'ask_name': {
        const n = spokenName(text);
        if (n) {
          this.name = n;
          return this.toConsent();
        }
        return this.retryOrCancel('ask_name');
      }
      case 'consent':
        return consentAnswer(text) === 'yes' ? this.capture() : this.cancel();
      case 'ask_delete_name': {
        const n = spokenName(text);
        if (n) {
          this.end();
          return this.doDelete(n);
        }
        if (!this.retried) return this.retryOrCancel('ask_delete_name');
        this.end();
        return this.d.say('sys.didnt_hear');
      }
    }
  }

  /** Stop the dialog with "Theek hai, save nahi kiya" (or silently). */
  cancel(silent = false): void {
    const wasEnrolling = this.phase !== 'idle' && this.phase !== 'ask_delete_name';
    this.end();
    if (!silent && wasEnrolling) this.d.say('sys.enroll_cancelled');
  }

  private toConsent() {
    this.setPhase('consent');
    this.d.say('sys.consent');
    this.arm();
  }

  private ask(phase: 'ask_name' | 'ask_delete_name') {
    this.retried = false;
    this.setPhase(phase);
    this.d.say('sys.ask_name');
    this.arm();
  }

  private retryOrCancel(phase: 'ask_name' | 'ask_delete_name') {
    if (this.retried) return this.cancel();
    this.retried = true;
    this.d.say('sys.ask_name');
    this.arm();
    this.setPhase(phase);
  }

  private async capture() {
    const gen = this.generation;
    const name = this.name!;
    this.disarm();
    this.setPhase('capturing');
    this.d.say('sys.enroll_hold');
    const r = await this.d.capture();
    if (gen !== this.generation) return; // cancelled or restarted meanwhile
    if (r.embeddings.length < this.cfg.enrollMinFrames) {
      this.end();
      return this.d.say('sys.enroll_no_face');
    }
    try {
      const existing = this.d.store.find(name);
      if (existing) await this.d.store.addEmbeddings(existing.id, r.embeddings);
      else await this.d.store.add(name, r.embeddings);
    } catch {
      this.end();
      return this.d.say('sys.enroll_cancelled');
    }
    if (gen !== this.generation) return;
    this.end();
    this.d.say('sys.saved');
    this.d.syncClips();
  }

  private async doDelete(name: string) {
    const removed = await this.d.store.remove(name);
    if (!removed) return this.d.say('sys.name_not_found');
    await this.d.deleteFiles(Object.values(removed.clips).filter((u): u is string => !!u)).catch(() => undefined);
    this.d.say('sys.deleted');
  }

  private arm() {
    this.disarm();
    const gen = this.generation;
    this.timer = setTimeout(() => {
      if (gen === this.generation) this.cancel();
    }, this.cfg.dialogTimeoutMs);
  }

  private disarm() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private end() {
    this.disarm();
    this.generation++;
    if (this.phase !== 'idle') this.d.setEnrolling(false);
    this.name = null;
    this.retried = false;
    this.setPhase('idle');
  }

  private setPhase(p: DialogPhase) {
    if (this.phase === p) return;
    this.phase = p;
    for (const l of this.listeners) l();
  }
}
