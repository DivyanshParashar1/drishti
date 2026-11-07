import { Directory, File, Paths } from 'expo-file-system';
import type { Lang } from '../core/lang';

/** Name clips live in the app's documents (kept across restarts, removed on uninstall). */
const dir = () => new Directory(Paths.document, 'names');

export async function writeNameClip(personId: number, lang: Lang, mp3: ArrayBuffer): Promise<string> {
  const d = dir();
  if (!d.exists) d.create({ idempotent: true, intermediates: true });
  const f = new File(d, `${personId}-${lang}.mp3`);
  await f.write(new Uint8Array(mp3));
  return f.uri;
}

export async function deleteFiles(uris: string[]): Promise<void> {
  for (const uri of uris) {
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      // already gone
    }
  }
}
