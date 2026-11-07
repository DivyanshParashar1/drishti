import type { Lang } from '../../core/lang';
import type { TtsResult } from '../../net/ttsClient';
import { NameClipSync } from '../nameClips';
import type { Person } from '../store';

function setup(names: string[], replies: TtsResult[] = []) {
  const people: Person[] = names.map((name, i) => ({ id: i + 1, name, embeddings: [], clips: {}, createdAt: 0 }));
  let online: boolean | null = true;
  const calls: string[] = [];
  const store = {
    get people() {
      return people;
    },
    setClip: async (id: number, lang: Lang, uri: string) => {
      people.find((p) => p.id === id)!.clips[lang] = uri;
    },
  };
  const sync = new NameClipSync({
    store,
    tts: async (text, lang) => {
      calls.push(`${lang}:${text}`);
      return replies.shift() ?? { ok: true, mp3: new ArrayBuffer(4) };
    },
    writeClip: async (id, lang) => `file:///names/${id}-${lang}.mp3`,
    online: () => online,
  });
  return { sync, people, calls, setOnline: (v: boolean | null) => (online = v) };
}

test('fetches the template text for every person missing a clip in that language', async () => {
  const t = setup(['Rahul', 'Priya']);
  t.people[1].clips['hi-en'] = 'file:///old.mp3';
  await t.sync.sync('hi-en');
  expect(t.calls).toEqual(['hi-en:Rahul aapke saamne hai']);
  expect(t.people[0].clips).toEqual({ 'hi-en': 'file:///names/1-hi-en.mp3' });
  await t.sync.sync('en');
  expect(t.calls.slice(1)).toEqual(['en:Rahul is here', 'en:Priya is here']);
});

test('offline: nothing is fetched; back online, the deferred clips are fetched', async () => {
  const t = setup(['Rahul']);
  t.setOnline(false);
  await t.sync.sync('hi-en');
  expect(t.calls).toEqual([]);
  t.setOnline(true);
  await t.sync.sync('hi-en');
  expect(t.people[0].clips['hi-en']).toBe('file:///names/1-hi-en.mp3');
});

test('stops at the first failure and keeps the error; the next sync retries', async () => {
  const t = setup(['Rahul', 'Priya'], [{ ok: false, code: 'network' }]);
  await t.sync.sync('hi-en');
  expect(t.calls).toHaveLength(1);
  expect(t.sync.lastError).toBe('network');
  expect(t.people.every((p) => !p.clips['hi-en'])).toBe(true);
  await t.sync.sync('hi-en');
  expect(t.people.every((p) => p.clips['hi-en'])).toBe(true);
  expect(t.sync.lastError).toBeNull();
});

test('calls during a run are queued, not run twice in parallel', async () => {
  const t = setup(['Rahul']);
  const a = t.sync.sync('hi-en');
  const b = t.sync.sync('hi-en');
  const c = t.sync.sync('en');
  await Promise.all([a, b, c]);
  expect(t.calls).toEqual(['hi-en:Rahul aapke saamne hai', 'en:Rahul is here']);
});
