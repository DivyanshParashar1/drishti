import type { Lang } from '../core/lang';
import type { KnownPerson } from './matcher';

/** The subset of expo-sqlite's SQLiteDatabase the store uses (tests pass a node:sqlite adapter). */
export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: (string | number | Uint8Array | null)[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, params: (string | number | Uint8Array | null)[]): Promise<T[]>;
}

export interface Person extends KnownPerson {
  embeddings: Float32Array[];
  clips: Partial<Record<Lang, string>>; // name-clip file uri per language (P9)
  createdAt: number;
}

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  vec BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS name_clips (
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  lang TEXT NOT NULL,
  uri TEXT NOT NULL,
  PRIMARY KEY (person_id, lang)
);`;

const toBlob = (v: ArrayLike<number>) => new Uint8Array(Float32Array.from(v).buffer);
// Copy first: a returned BLOB may not be 4-byte aligned.
const fromBlob = (b: Uint8Array) => new Float32Array(b.slice().buffer);

/**
 * Registered people (F3/F4) in SQLite: name, embeddings and name-clip paths. **No photos, ever**:
 * only 128-d embeddings are stored. All people are cached in memory for per-frame matching.
 */
export class IdentityStore {
  private cache: Person[] = [];
  private listeners: (() => void)[] = [];

  constructor(
    private readonly db: SqlDb,
    private readonly now: () => number = Date.now,
  ) {}

  get people(): readonly Person[] {
    return this.cache;
  }

  async init(): Promise<void> {
    await this.db.execAsync(SCHEMA);
    await this.reload();
  }

  onChange(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  find(name: string): Person | undefined {
    const k = name.trim().toLowerCase();
    return this.cache.find((p) => p.name.toLowerCase() === k);
  }

  /** Add a person with their embeddings. Throws if the name exists (case-insensitive). */
  async add(name: string, embeddings: ArrayLike<number>[]): Promise<Person> {
    const clean = name.trim();
    if (!clean) throw new Error('empty name');
    if (embeddings.length === 0) throw new Error('no embeddings');
    if (this.find(clean)) throw new Error(`name exists: ${clean}`);
    const { lastInsertRowId: id } = await this.db.runAsync('INSERT INTO people (name, created_at) VALUES (?, ?)', [clean, this.now()]);
    for (const e of embeddings) await this.db.runAsync('INSERT INTO embeddings (person_id, vec) VALUES (?, ?)', [id, toBlob(e)]);
    await this.reload();
    return this.cache.find((p) => p.id === id)!;
  }

  async setClip(personId: number, lang: Lang, uri: string): Promise<void> {
    await this.db.runAsync('INSERT OR REPLACE INTO name_clips (person_id, lang, uri) VALUES (?, ?, ?)', [personId, lang, uri]);
    await this.reload();
  }

  /** Delete a person and every embedding and clip row. Returns what was removed (to delete files). */
  async remove(name: string): Promise<Person | null> {
    const p = this.find(name);
    if (!p) return null;
    await this.db.runAsync('DELETE FROM embeddings WHERE person_id = ?', [p.id]);
    await this.db.runAsync('DELETE FROM name_clips WHERE person_id = ?', [p.id]);
    await this.db.runAsync('DELETE FROM people WHERE id = ?', [p.id]);
    await this.reload();
    return p;
  }

  private async reload(): Promise<void> {
    const people = await this.db.getAllAsync<{ id: number; name: string; created_at: number }>(
      'SELECT id, name, created_at FROM people ORDER BY id',
      [],
    );
    const embs = await this.db.getAllAsync<{ person_id: number; vec: Uint8Array }>('SELECT person_id, vec FROM embeddings ORDER BY id', []);
    const clips = await this.db.getAllAsync<{ person_id: number; lang: Lang; uri: string }>('SELECT person_id, lang, uri FROM name_clips', []);
    this.cache = people.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      embeddings: embs.filter((e) => e.person_id === r.id).map((e) => fromBlob(e.vec)),
      clips: Object.fromEntries(clips.filter((c) => c.person_id === r.id).map((c) => [c.lang, c.uri])),
    }));
    for (const l of this.listeners) l();
  }
}
