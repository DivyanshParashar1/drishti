import { ClipPlayer, toSteps, type AudioBackend } from '../clipPlayer';
import type { PlayOutcome } from '../scheduler';

jest.mock('../clips.generated', () => ({
  CLIPS: {
    'hi-en': {
      'obj.car': { text: 'Car', en: 'Car', asset: 101 },
      'dir.left': { text: 'left mein', en: 'on the left', asset: 102 },
      'dist.near': { text: 'paas', en: 'close', asset: null },
      'obj.chair': { text: 'Kursi', en: 'Chair', asset: null },
      'dir.ahead': { text: 'aage', en: 'ahead', asset: null },
    },
  },
}));

class FakeBackend implements AudioBackend {
  calls: string[] = [];
  preloaded: (number | string)[] = [];
  private pending: ((o: PlayOutcome) => void) | null = null;
  constructor(private auto = true) {}

  playSource(source: number | string) {
    this.calls.push(`src:${source}`);
    return this.wait();
  }
  speak(text: string, locale: string) {
    this.calls.push(`speak:${locale}:${text}`);
    return this.wait();
  }
  async stop() {
    this.calls.push('stop');
    const p = this.pending;
    this.pending = null;
    p?.('stopped');
  }
  async preload(s: number | string) {
    this.preloaded.push(s);
  }
  private wait(): Promise<PlayOutcome> {
    if (this.auto) return Promise.resolve('done');
    return new Promise((r) => (this.pending = r));
  }
}

test('generated clips play as sources, missing ones are spoken', () => {
  expect(
    toSteps(
      [
        { kind: 'clip', key: 'obj.car' },
        { kind: 'clip', key: 'dir.left' },
        { kind: 'clip', key: 'dist.near' },
      ] as never,
      'hi-en',
    ),
  ).toEqual([
    { kind: 'source', source: 101 },
    { kind: 'source', source: 102 },
    { kind: 'speak', text: 'paas' },
  ]);
});

test('neighbouring spoken pieces merge; a pause between them becomes a comma', () => {
  const steps = toSteps(
    [
      { kind: 'clip', key: 'dist.near' },
      { kind: 'pause', ms: 120 },
      { kind: 'clip', key: 'obj.chair' },
      { kind: 'clip', key: 'dir.ahead' },
    ] as never,
    'hi-en',
  );
  expect(steps).toEqual([{ kind: 'speak', text: 'paas, Kursi aage' }]);
});

test('a pause next to a real clip stays a pause', () => {
  const steps = toSteps(
    [
      { kind: 'clip', key: 'obj.car' },
      { kind: 'pause', ms: 120 },
      { kind: 'clip', key: 'obj.chair' },
    ] as never,
    'hi-en',
  );
  expect(steps).toEqual([
    { kind: 'source', source: 101 },
    { kind: 'pause', ms: 120 },
    { kind: 'speak', text: 'Kursi' },
  ]);
});

test('files play by uri; speak parts use the language locale', async () => {
  const b = new FakeBackend();
  const p = new ClipPlayer(b);
  expect(
    await p.play(
      [
        { kind: 'file', uri: 'file:///a.mp3', text: 'Rahul aage' },
        { kind: 'speak', text: 'Internet nahi hai' },
      ],
      'hi-en',
    ),
  ).toBe('done');
  expect(b.calls).toEqual(['src:file:///a.mp3', 'speak:hi-IN:Internet nahi hai']);
});

test('stop mid-sequence ends the play as stopped and skips the rest', async () => {
  const b = new FakeBackend(false);
  const p = new ClipPlayer(b);
  const done = p.play(
    [
      { kind: 'clip', key: 'obj.car' },
      { kind: 'clip', key: 'dir.left' },
    ] as never,
    'hi-en',
  );
  await Promise.resolve();
  await p.stop();
  expect(await done).toBe('stopped');
  expect(b.calls).toEqual(['src:101', 'stop']);
});

test('stop during a pause wakes it immediately', async () => {
  jest.useFakeTimers();
  const b = new FakeBackend();
  const p = new ClipPlayer(b);
  const done = p.play([{ kind: 'pause', ms: 10_000 }], 'hi-en');
  await p.stop();
  expect(await done).toBe('stopped');
  jest.useRealTimers();
});

test('preloadPack preloads only generated clips', async () => {
  const b = new FakeBackend();
  expect(await new ClipPlayer(b).preloadPack('hi-en')).toBe(2);
  expect(b.preloaded).toEqual([101, 102]);
});

test('a phrase with no bundled clip plays its saved Timbre file when there is one', () => {
  const { toSteps } = jest.requireActual('../clipPlayer') as typeof import('../clipPlayer');
  const lookup = (_l: string, k: string) => (k === 'obj.chair' ? 'file:///phrases/hi-en/obj.chair.mp3' : k === 'obj.car' ? 'file:///never.mp3' : undefined);
  const steps = toSteps(
    [
      { kind: 'clip', key: 'obj.car' }, // bundled clip wins over a saved file
      { kind: 'clip', key: 'obj.chair' }, // saved Timbre file
      { kind: 'clip', key: 'dist.near' }, // neither: spoken
    ],
    'hi-en',
    lookup,
  );
  expect(steps).toEqual([
    { kind: 'source', source: 101 },
    { kind: 'source', source: 'file:///phrases/hi-en/obj.chair.mp3' },
    { kind: 'speak', text: 'paas' },
  ]);
});

describe('live Timbre (demo mode)', () => {
  test('a whole alert line is one live fetch, played as one file', async () => {
    const b = new FakeBackend();
    const live = jest.fn(async (text: string) => `live:${text}`);
    const p = new ClipPlayer(b, () => undefined, live);
    await p.play([{ kind: 'clip', key: 'obj.chair' }, { kind: 'clip', key: 'dir.ahead' }, { kind: 'clip', key: 'dist.near' }], 'hi-en');
    expect(live).toHaveBeenCalledWith('Kursi aage paas', 'hi-en');
    expect(b.calls).toEqual(['src:live:Kursi aage paas']);
  });

  test('if any piece is unavailable, the line plays the normal way', async () => {
    const b = new FakeBackend();
    const p = new ClipPlayer(b, () => undefined, async () => null);
    await p.play([{ kind: 'clip', key: 'obj.car' }, { kind: 'clip', key: 'dir.left' }], 'hi-en');
    expect(b.calls).toEqual(['src:101', 'src:102']);
  });

  test('stop() during a live fetch returns at once', async () => {
    const b = new FakeBackend();
    const p = new ClipPlayer(b, () => undefined, () => new Promise<string | null>(() => undefined)); // never answers
    const playing = p.play([{ kind: 'speak', text: 'Rahul aapke saamne hai' }], 'hi-en');
    await p.stop();
    await expect(playing).resolves.toBe('stopped');
    expect(b.calls).toEqual(['stop']);
  });
});
