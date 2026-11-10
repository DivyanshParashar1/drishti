import { LiveTts, liveName } from '../liveTts';

const setup = (over: { ok?: boolean; online?: boolean | null } = {}) => {
  const tts = jest.fn(async () => (over.ok === false ? { ok: false as const, code: 'timeout' } : { ok: true as const, mp3: new ArrayBuffer(4) }));
  const write = jest.fn(async (name: string) => `file:///${name}.mp3`);
  return { live: new LiveTts({ tts, write, online: () => over.online ?? true }, 100), tts, write };
};

test('fetches a line once and reuses the file', async () => {
  const { live, tts } = setup();
  const a = await live.get('Kursi aage, paas', 'hi-en');
  const b = await live.get('Kursi aage, paas', 'hi-en');
  expect(a).toBe(b);
  expect(a).toMatch(/^file:\/\/\/hi-en-[0-9a-f]+-16\.mp3$/);
  expect(tts).toHaveBeenCalledTimes(1);
  expect(tts).toHaveBeenCalledWith('Kursi aage, paas', 'hi-en', 100);
});

test('offline, empty or failed → null, and a failure is retried next time', async () => {
  expect(await setup({ online: false }).live.get('Kursi', 'hi-en')).toBeNull();
  expect(await setup().live.get('  ', 'hi-en')).toBeNull();
  const { live, tts } = setup({ ok: false });
  expect(await live.get('Kursi', 'hi-en')).toBeNull();
  expect(await live.get('Kursi', 'hi-en')).toBeNull();
  expect(tts).toHaveBeenCalledTimes(2);
});

test('names differ by language and text', () => {
  expect(liveName('hi', 'Kursi')).not.toBe(liveName('en', 'Kursi'));
  expect(liveName('hi', 'Kursi')).not.toBe(liveName('hi', 'Kursii'));
});
