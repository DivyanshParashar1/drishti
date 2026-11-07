import type { Lang } from '../../core/lang';
import type { TtsResult } from '../../net/ttsClient';
import { CLIPS, type ClipKey } from '../clips.generated';
import { PhraseCache } from '../phraseCache';

function setup(opts: { saved?: Partial<Record<ClipKey, string>>; fail?: number; code?: string } = {}) {
  const calls: string[] = [];
  let online: boolean | null = true;
  let n = 0;
  const cache = new PhraseCache({
    tts: async (text, lang): Promise<TtsResult> => {
      calls.push(`${lang}:${text}`);
      if (opts.fail !== undefined && n++ === opts.fail) return { ok: false, code: opts.code ?? 'network' };
      return { ok: true, mp3: new ArrayBuffer(2) };
    },
    write: async (lang, key) => `file:///phrases/${lang}/${key}.mp3`,
    list: async () => ({ ...(opts.saved ?? {}) }),
    online: () => online,
  }, 0, 1000);
  return { cache, calls, setOnline: (v: boolean | null) => (online = v) };
}

const total = Object.keys(CLIPS['hi-en']).length;

test('fetches every phrase of the language once, hazard words first, then serves the files', async () => {
  const t = setup();
  await t.cache.sync('hi-en');
  expect(t.calls).toHaveLength(total);
  expect(t.calls[0]).toBe(`hi-en:${CLIPS['hi-en']['obj.person'].text}`);
  const at = (k: ClipKey) => t.calls.indexOf(`hi-en:${CLIPS['hi-en'][k].text}`);
  const alertWords = (Object.keys(CLIPS['hi-en']) as ClipKey[]).filter((k) => /^(obj|dir|dist)\./.test(k));
  expect(Math.max(...alertWords.map(at))).toBeLessThan(at('sys.welcome')); // hazard words before the tutorial
  expect(at('sys.unknown_person')).toBeLessThan(at('sys.tutorial_1'));
  expect(t.cache.uri('hi-en', 'dir.left')).toBe('file:///phrases/hi-en/dir.left.mp3');
  expect(t.cache.progress('hi-en')).toEqual({ ready: total, total });
  await t.cache.sync('hi-en');
  expect(t.calls).toHaveLength(total); // nothing fetched twice
});

test('phrases already saved on the phone are not fetched again', async () => {
  const t = setup({ saved: { 'obj.person': 'file:///old.mp3' } });
  await t.cache.load('hi-en');
  expect(t.cache.uri('hi-en', 'obj.person')).toBe('file:///old.mp3');
  await t.cache.sync('hi-en');
  expect(t.calls).toHaveLength(total - 1);
});

test('offline: nothing fetched; a failure stops the run and the next sync continues', async () => {
  const t = setup({ fail: 3 });
  t.setOnline(false);
  await t.cache.sync('ta');
  expect(t.calls).toEqual([]);
  t.setOnline(true);
  await t.cache.sync('ta');
  expect(t.calls).toHaveLength(4);
  expect(t.cache.lastError).toBe('network');
  await t.cache.sync('ta');
  expect(t.cache.progress('ta').ready).toBe(total);
  expect(t.cache.lastError).toBeNull();
});

test('each language is separate', async () => {
  const t = setup();
  await t.cache.sync('en' as Lang);
  expect(t.cache.uri('en', 'dir.left')).toBeDefined();
  expect(t.cache.uri('hi-en', 'dir.left')).toBeUndefined();
});

test('rate limited: the run stops and retries by itself later', async () => {
  jest.useFakeTimers();
  try {
    const t = setup({ fail: 2, code: 'rate_limited' });
    await t.cache.sync('hi-en');
    expect(t.calls).toHaveLength(3);
    expect(t.cache.lastError).toBe('rate_limited');
    jest.advanceTimersByTime(1000);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await t.cache.sync('hi-en');
    expect(t.cache.progress('hi-en').ready).toBe(total);
  } finally {
    jest.useRealTimers();
  }
});
