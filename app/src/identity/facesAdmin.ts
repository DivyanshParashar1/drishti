import type { Lang } from '../core/lang';
import type { IdentityStore, Person } from './store';

/** What the saved-faces screen needs (tests pass fakes for the files and clip sync). */
export interface FacesAdminDeps {
  store: Pick<IdentityStore, 'people' | 'find' | 'add' | 'addEmbeddings' | 'rename' | 'remove'>;
  /** Delete name-clip files. */
  deleteFiles(uris: string[]): Promise<void>;
  /** Make name clips ("Rahul aapke saamne hai") for anyone missing one (no-op offline). */
  syncClips(lang: Lang): void;
  lang(): Lang;
}

export type AdminResult = { ok: true; message: string; person?: Person } | { ok: false; message: string };

const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * P17 saved faces: create from a photo, add photos, rename, delete. Only embeddings and name
 * clips are kept; photos never are (store.ts). Saving needs the person's consent, which the
 * screen asks the user to confirm (`consent`), like the voice flow's "raazi hain?" step.
 */
export class FacesAdmin {
  constructor(private readonly d: FacesAdminDeps) {}

  /** New person from one photo's embedding, or add it to the person already saved under that name. */
  async addFromPhoto(name: string, embedding: number[], consent: boolean): Promise<AdminResult> {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return { ok: false, message: 'Type a name first.' };
    if (!consent) return { ok: false, message: 'Confirm that this person agreed to be saved.' };
    try {
      const existing = this.d.store.find(clean);
      if (existing) {
        await this.d.store.addEmbeddings(existing.id, [embedding]);
        return { ok: true, message: `Added another photo to ${existing.name}.`, person: this.d.store.find(clean) };
      }
      const person = await this.d.store.add(clean, [embedding]);
      this.d.syncClips(this.d.lang());
      return { ok: true, message: `Saved ${person.name}. Adding 2–3 more photos improves recognition.`, person };
    } catch (e) {
      return { ok: false, message: err(e) };
    }
  }

  async addPhoto(person: Person, embedding: number[]): Promise<AdminResult> {
    try {
      await this.d.store.addEmbeddings(person.id, [embedding]);
      return { ok: true, message: `Added a photo to ${person.name}.` };
    } catch (e) {
      return { ok: false, message: err(e) };
    }
  }

  async rename(person: Person, name: string): Promise<AdminResult> {
    try {
      const { person: renamed, oldClips } = await this.d.store.rename(person.id, name.replace(/\s+/g, ' '));
      await this.d.deleteFiles(oldClips);
      this.d.syncClips(this.d.lang());
      return { ok: true, message: `Renamed to ${renamed.name}.`, person: renamed };
    } catch (e) {
      const m = err(e);
      return { ok: false, message: m.startsWith('name exists') ? 'Someone is already saved with that name.' : m === 'empty name' ? 'Type a name.' : m };
    }
  }

  async remove(person: Person): Promise<AdminResult> {
    try {
      const gone = await this.d.store.remove(person.name);
      if (gone) await this.d.deleteFiles(Object.values(gone.clips) as string[]);
      return { ok: true, message: `Deleted ${person.name}.` };
    } catch (e) {
      return { ok: false, message: err(e) };
    }
  }
}
