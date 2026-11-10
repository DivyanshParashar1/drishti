import { Directory, File, Paths } from 'expo-file-system';
import type { Lang } from '../core/lang';
import type { ClipKey } from './clips.generated';

/** Timbre phrase audio lives in the app's documents: phrases/<lang>/<key>.mp3. */
const dir = (lang: Lang) => new Directory(Paths.document, 'phrases', lang);

export async function writePhrase(lang: Lang, key: ClipKey, mp3: ArrayBuffer): Promise<string> {
  const d = dir(lang);
  if (!d.exists) d.create({ idempotent: true, intermediates: true });
  const f = new File(d, `${key}.mp3`);
  await f.write(new Uint8Array(mp3));
  return f.uri;
}

export async function listPhrases(lang: Lang): Promise<Partial<Record<ClipKey, string>>> {
  const d = dir(lang);
  if (!d.exists) return {};
  const out: Partial<Record<ClipKey, string>> = {};
  for (const entry of d.list()) {
    if (entry instanceof File && entry.name.endsWith('.mp3') && entry.size > 0) {
      out[entry.name.slice(0, -4) as ClipKey] = entry.uri;
    }
  }
  return out;
}

/** DEMO live Timbre lines (liveTts.ts): cache/live/<name>.mp3, rebuilt each session. */
export async function writeLiveLine(name: string, mp3: ArrayBuffer): Promise<string> {
  const d = new Directory(Paths.cache, 'live');
  if (!d.exists) d.create({ idempotent: true, intermediates: true });
  const f = new File(d, `${name}.mp3`);
  await f.write(new Uint8Array(mp3));
  return f.uri;
}
