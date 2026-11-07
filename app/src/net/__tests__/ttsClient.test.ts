import { fetchTts } from '../ttsClient';

jest.mock('expo-constants', () => ({ expoConfig: { extra: { serverUrl: 'http://srv:8000/', appToken: 'tok' } } }));

const res = (status: number, body: unknown, bytes?: Uint8Array) =>
  ({
    ok: status < 400,
    status,
    json: async () => {
      if (typeof body === 'string') throw new Error('not json');
      return body;
    },
    arrayBuffer: async () => bytes!.buffer,
  }) as unknown as Response;

test('posts text and lang with the token and returns the MP3 bytes', async () => {
  const fetchFn = jest.fn(async () => res(200, null, new Uint8Array([1, 2, 3])));
  const r = await fetchTts('Rahul aapke saamne hai', 'hi-en', fetchFn as unknown as typeof fetch);
  expect(r).toEqual({ ok: true, mp3: new Uint8Array([1, 2, 3]).buffer });
  const [url, init] = (fetchFn.mock.calls[0] as unknown) as [string, RequestInit];
  expect(url).toBe('http://srv:8000/tts');
  expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
  expect(JSON.parse(init.body as string)).toEqual({ text: 'Rahul aapke saamne hai', lang: 'hi-en' });
});

test('server error codes, plain HTTP errors and network failures become codes', async () => {
  expect(await fetchTts('x', 'en', (async () => res(429, { code: 'rate_limited' })) as unknown as typeof fetch)).toEqual({ ok: false, code: 'rate_limited' });
  expect(await fetchTts('x', 'en', (async () => res(500, 'oops')) as unknown as typeof fetch)).toEqual({ ok: false, code: 'http_500' });
  expect(
    await fetchTts('x', 'en', (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch),
  ).toEqual({ ok: false, code: 'network' });
});

test('a hung request times out', async () => {
  const hang = ((_: string, init: RequestInit) =>
    new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
  expect(await fetchTts('x', 'en', hang, 20)).toEqual({ ok: false, code: 'timeout' });
});
