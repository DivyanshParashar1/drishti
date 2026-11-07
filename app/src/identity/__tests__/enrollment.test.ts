import type { AudioPart } from '../../audio/scheduler';
import { BASIS } from '../__fixtures__/embeddings';
import { IDENTITY } from '../config';
import { EnrollmentDialog } from '../enrollment';
import type { CaptureResult } from '../identifier';
import type { Person } from '../store';

const flush = () => new Promise<void>((r) => setImmediate(() => r()));

function setup(opts: { capture?: CaptureResult; people?: Person[] } = {}) {
  const said: string[] = [];
  const people: Person[] = opts.people ?? [];
  const log: string[] = [];
  let nextId = 100;
  let releaseCapture: ((r: CaptureResult) => void) | null = null;
  const store = {
    get people() {
      return people;
    },
    find: (n: string) => people.find((p) => p.name.toLowerCase() === n.toLowerCase()),
    add: async (name: string, embeddings: ArrayLike<number>[]) => {
      const p: Person = { id: nextId++, name, embeddings: embeddings.map((e) => Float32Array.from(e)), clips: {}, createdAt: 0 };
      people.push(p);
      log.push(`add ${name} ${embeddings.length}`);
      return p;
    },
    addEmbeddings: async (id: number, e: ArrayLike<number>[]) => void log.push(`addEmbeddings ${id} ${e.length}`),
    remove: async (n: string) => {
      const i = people.findIndex((p) => p.name.toLowerCase() === n.toLowerCase());
      if (i < 0) return null;
      log.push(`remove ${people[i].name}`);
      return people.splice(i, 1)[0];
    },
  };
  const good: CaptureResult = { embeddings: Array.from({ length: 8 }, (_, k) => BASIS[k]), multiFaceFrames: 0 };
  const dialog = new EnrollmentDialog(
    {
      say: (k) => void said.push(k),
      speak: (parts: AudioPart[]) => void said.push(parts.map((p) => (p.kind === 'clip' ? p.key : p.kind === 'speak' ? p.text : '')).join(' | ')),
      capture: () =>
        opts.capture === undefined
          ? Promise.resolve(good)
          : new Promise((r) => {
              releaseCapture = r;
            }),
      store,
      syncClips: () => void log.push('syncClips'),
      deleteFiles: async (uris) => void log.push(`deleteFiles ${uris.join(',')}`),
      setEnrolling: (on) => void log.push(`enrolling ${on}`),
    },
    IDENTITY,
  );
  return { dialog, said, log, people, release: (r: CaptureResult = opts.capture!) => releaseCapture?.(r) };
}

afterEach(() => jest.useRealTimers());

test('named save: consent → yes → capture → stored → saved, then clips fetched', async () => {
  const t = setup();
  t.dialog.save('Rahul');
  expect(t.said).toEqual(['sys.consent']);
  expect(t.dialog.wantsTranscript).toBe(true);
  await t.dialog.onTranscript('haan ji');
  await flush();
  expect(t.said).toEqual(['sys.consent', 'sys.enroll_hold', 'sys.saved']);
  expect(t.log).toEqual(['enrolling true', 'add Rahul 8', 'enrolling false', 'syncClips']);
  expect(t.dialog.phase).toBe('idle');
});

test('no name in the command: "Naam bataiye" → the next transcript is the name', async () => {
  const t = setup();
  t.dialog.save(null);
  expect(t.said).toEqual(['sys.ask_name']);
  await t.dialog.onTranscript('iska naam anil kumar hai');
  expect(t.said.at(-1)).toBe('sys.consent');
  await t.dialog.onTranscript('yes');
  await flush();
  expect(t.people.map((p) => p.name)).toEqual(['Anil Kumar']);
});

test('an unusable name is asked once more, then the dialog cancels', async () => {
  const t = setup();
  t.dialog.save(null);
  await t.dialog.onTranscript('');
  expect(t.said).toEqual(['sys.ask_name', 'sys.ask_name']);
  await t.dialog.onTranscript('one two three four');
  expect(t.said.at(-1)).toBe('sys.enroll_cancelled');
  expect(t.dialog.phase).toBe('idle');
});

test('consent no (or anything not a clear yes) → cancelled, nothing stored', async () => {
  for (const answer of ['nahi', 'haan nahi', 'kya?']) {
    const t = setup();
    t.dialog.save('Rahul');
    await t.dialog.onTranscript(answer);
    expect(t.said).toEqual(['sys.consent', 'sys.enroll_cancelled']);
    expect(t.people).toEqual([]);
    expect(t.log).toEqual(['enrolling true', 'enrolling false']);
  }
});

test('"ruko" during the dialog cancels it', async () => {
  const t = setup();
  t.dialog.save(null);
  await t.dialog.onTranscript('ruko');
  expect(t.said).toEqual(['sys.ask_name', 'sys.enroll_cancelled']);
  expect(t.dialog.wantsTranscript).toBe(false);
});

test('no answer within 30 s → cancelled', () => {
  jest.useFakeTimers();
  const t = setup();
  t.dialog.save('Rahul');
  jest.advanceTimersByTime(IDENTITY.dialogTimeoutMs - 1);
  expect(t.dialog.phase).toBe('consent');
  jest.advanceTimersByTime(2);
  expect(t.said).toEqual(['sys.consent', 'sys.enroll_cancelled']);
  expect(t.dialog.phase).toBe('idle');
});

test('the timer restarts on each prompt and stops during capture', async () => {
  jest.useFakeTimers();
  const t = setup({ capture: { embeddings: [], multiFaceFrames: 0 } });
  t.dialog.save(null);
  jest.advanceTimersByTime(20_000);
  await t.dialog.onTranscript('Rahul');
  jest.advanceTimersByTime(20_000); // 40 s since start, 20 s since the consent prompt
  expect(t.dialog.phase).toBe('consent');
  void t.dialog.onTranscript('haan'); // capture is held open by the test
  jest.advanceTimersByTime(60_000);
  expect(t.dialog.phase).toBe('capturing'); // capture has its own duration
});

test('no face, or two faces in view → "Chehra saaf nahi dikha", nothing stored', async () => {
  for (const r of [
    { embeddings: [], multiFaceFrames: 0 },
    { embeddings: [BASIS[0], BASIS[1]], multiFaceFrames: 30 },
  ]) {
    const t = setup({ capture: r });
    t.dialog.save('Rahul');
    const answered = t.dialog.onTranscript('haan');
    t.release();
    await answered;
    expect(t.said).toEqual(['sys.consent', 'sys.enroll_hold', 'sys.enroll_no_face']);
    expect(t.people).toEqual([]);
  }
});

test('cancelled during capture: the late capture result is ignored', async () => {
  const t = setup({ capture: { embeddings: [BASIS[0], BASIS[1], BASIS[2], BASIS[3], BASIS[4]], multiFaceFrames: 0 } });
  t.dialog.save('Rahul');
  const answered = t.dialog.onTranscript('haan');
  t.dialog.cancel(true);
  t.release();
  await answered;
  expect(t.people).toEqual([]);
  expect(t.said).toEqual(['sys.consent', 'sys.enroll_hold']);
});

test('saving an existing name adds embeddings to that person', async () => {
  const rahul: Person = { id: 7, name: 'Rahul', embeddings: [], clips: {}, createdAt: 0 };
  const t = setup({ people: [rahul] });
  t.dialog.save('rahul');
  await t.dialog.onTranscript('haan');
  await flush();
  expect(t.log).toContain('addEmbeddings 7 8');
  expect(t.people).toHaveLength(1);
});

test('delete removes the person and their clip files, then confirms; unknown name → not found', async () => {
  const p: Person = { id: 3, name: 'Priya', embeddings: [], clips: { 'hi-en': 'file:///a.mp3', en: 'file:///b.mp3' }, createdAt: 0 };
  const t = setup({ people: [p] });
  await t.dialog.delete('priya');
  expect(t.log).toEqual(['remove Priya', 'deleteFiles file:///a.mp3,file:///b.mp3']);
  expect(t.said).toEqual(['sys.deleted']);
  await t.dialog.delete('Priya');
  expect(t.said.at(-1)).toBe('sys.name_not_found');
});

test('delete without a name asks for it', async () => {
  const p: Person = { id: 3, name: 'Priya', embeddings: [], clips: {}, createdAt: 0 };
  const t = setup({ people: [p] });
  await t.dialog.delete(null);
  expect(t.said).toEqual(['sys.ask_name']);
  await t.dialog.onTranscript('Priya');
  expect(t.said).toEqual(['sys.ask_name', 'sys.deleted']);
  expect(t.people).toEqual([]);
});

test('list reads the names, or says nobody is saved', () => {
  const t = setup();
  t.dialog.list();
  expect(t.said).toEqual(['sys.no_one_saved']);
  t.people.push({ id: 1, name: 'Rahul', embeddings: [], clips: {}, createdAt: 0 }, { id: 2, name: 'Priya', embeddings: [], clips: {}, createdAt: 0 });
  t.dialog.list();
  expect(t.said.at(-1)).toBe('sys.saved_list | Rahul, Priya');
});

test('transcripts are ignored when the dialog is not waiting for one', async () => {
  const t = setup();
  await t.dialog.onTranscript('haan');
  expect(t.said).toEqual([]);
});
