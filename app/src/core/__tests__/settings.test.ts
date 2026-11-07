import { CLIPS, type ClipKey } from '../../audio/clips.generated';
import { memoryDb } from '../__fixtures__/memoryDb';
import { playFirstRun, TUTORIAL } from '../firstRun';
import { LANGS } from '../lang';
import { applyLanguage } from '../language';
import { SettingsStore } from '../settings';

test('language and first-run persist across a restart (re-open of the same database)', async () => {
  const db = memoryDb();
  const a = new SettingsStore(db);
  await a.init();
  expect(a.lang).toBeNull();
  expect(a.firstRunDone).toBe(false);
  await a.setLang('ta');
  await a.setFirstRunDone();
  const b = new SettingsStore(db);
  await b.init();
  expect(b.lang).toBe('ta');
  expect(b.firstRunDone).toBe(true);
  await b.setLang('en');
  const c = new SettingsStore(db);
  await c.init();
  expect(c.lang).toBe('en');
});

test('an unknown saved language code is ignored', async () => {
  const db = memoryDb();
  await db.execAsync('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  await db.runAsync("INSERT INTO settings VALUES ('lang', 'fr')", []);
  const s = new SettingsStore(db);
  await s.init();
  expect(s.lang).toBeNull();
});

test('applyLanguage updates every holder, preloads the pack, persists, and syncs name clips', async () => {
  const log: string[] = [];
  const t = {
    holder: { lang: 'hi-en' as const as (typeof LANGS)[number] },
    reflex: { lang: 'hi-en' as (typeof LANGS)[number] },
    player: { preloadPack: async (l: string) => void log.push(`preload ${l}`) },
    settings: { setLang: async (l: string) => void log.push(`persist ${l}`) },
    nameClips: { sync: async (l: string) => void log.push(`names ${l}`) },
  };
  await applyLanguage(t, 'ta');
  expect(t.holder.lang).toBe('ta');
  expect(t.reflex.lang).toBe('ta');
  expect(log.sort()).toEqual(['names ta', 'persist ta', 'preload ta']);
});

test('all four clip packs define every phrase (text present; audio may still be pending)', () => {
  const keys = Object.keys(CLIPS['hi-en']) as ClipKey[];
  expect(keys.length).toBeGreaterThan(50);
  for (const lang of LANGS) {
    expect(Object.keys(CLIPS[lang]).sort()).toEqual([...keys].sort());
    for (const k of keys) expect(CLIPS[lang][k].text.trim()).not.toBe('');
  }
});

test('first run plays the tutorial once, across restarts', async () => {
  const db = memoryDb();
  let plays = 0;
  const s1 = new SettingsStore(db);
  await s1.init();
  expect(await playFirstRun(s1, () => plays++)).toBe(true);
  expect(await playFirstRun(s1, () => plays++)).toBe(false);
  const s2 = new SettingsStore(db);
  await s2.init();
  expect(await playFirstRun(s2, () => plays++)).toBe(false);
  expect(plays).toBe(1);
  expect(TUTORIAL[0]).toBe('sys.welcome');
  expect(TUTORIAL).toContain('sys.cane');
});
