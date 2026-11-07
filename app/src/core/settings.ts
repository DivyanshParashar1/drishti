import type { SqlDb } from '../identity/store';
import { LANGS, type Lang } from './lang';

/** Small persisted settings (F8 language, F10 first run) in the app's SQLite database. */
export class SettingsStore {
  private values = new Map<string, string>();

  constructor(private readonly db: SqlDb) {}

  async init(): Promise<void> {
    await this.db.execAsync('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
    const rows = await this.db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings', []);
    this.values = new Map(rows.map((r) => [r.key, r.value]));
  }

  /** The saved language, or null if none (or an unknown code) was saved. */
  get lang(): Lang | null {
    const v = this.values.get('lang');
    return v && (LANGS as readonly string[]).includes(v) ? (v as Lang) : null;
  }

  get firstRunDone(): boolean {
    return this.values.get('first_run_done') === '1';
  }

  setLang(lang: Lang): Promise<void> {
    return this.set('lang', lang);
  }

  setFirstRunDone(): Promise<void> {
    return this.set('first_run_done', '1');
  }

  private async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    await this.db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
}
