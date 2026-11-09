import {
  SpeechScheduler,
  type AudioPart,
  type PlayOutcome,
  type Player,
  type Priority,
  type Source,
  type Utterance,
} from '../scheduler';

/** A player whose plays finish only when the test says so. */
class FakePlayer implements Player {
  played: string[] = []; // labels of every play() call, in order
  stops = 0;
  private pending: ((o: PlayOutcome) => void) | null = null;

  play(parts: AudioPart[]): Promise<PlayOutcome> {
    this.played.push(label(parts));
    return new Promise((resolve) => (this.pending = resolve));
  }

  async stop(): Promise<void> {
    this.stops++;
    this.resolve('stopped');
  }

  /** Finish the current play. */
  finish(): void {
    this.resolve('done');
  }

  get playing(): string | null {
    return this.pending ? this.played[this.played.length - 1] : null;
  }

  private resolve(o: PlayOutcome) {
    const p = this.pending;
    this.pending = null;
    p?.(o);
  }
}

const label = (parts: AudioPart[]) =>
  parts
    .map((p) => (p.kind === 'speak' ? p.text : p.kind === 'pause' ? '|' : p.kind === 'clip' ? p.key : p.text))
    .join(' ');

let now = 0;
const clock = () => now;
const flush = () => new Promise<void>((r) => setImmediate(() => r()));

let n = 0;
function utt(text: string, priority: Priority, source: Source = 'system', extra: Partial<Utterance> = {}): Utterance {
  return { id: `u${++n}`, priority, source, lang: 'hi-en', parts: [{ kind: 'speak', text }], createdAt: now, ...extra };
}

function setup() {
  const player = new FakePlayer();
  const log: string[] = [];
  const s = new SpeechScheduler(
    player,
    {
      onStart: (u) => log.push(`start ${label(u.parts)}`),
      onEnd: (u, r) => log.push(`end ${label(u.parts)} ${r}`),
      onDrop: (u, r) => log.push(`drop ${label(u.parts)} ${r}`),
    },
    clock,
  );
  return { player, log, s };
}

beforeEach(() => {
  now = 0;
});

test('plays by priority, FIFO within a priority', async () => {
  const { player, s } = setup();
  s.enqueue(utt('first', 4)); // starts immediately
  s.enqueue(utt('confirm', 4));
  s.enqueue(utt('answer 1', 3, 'answer'));
  s.enqueue(utt('answer 2', 3, 'answer'));
  s.enqueue(utt('Rahul', 1, 'reflex'));
  for (let i = 0; i < 5; i++) {
    await flush();
    player.finish();
  }
  await flush();
  expect(player.played).toEqual(['first', 'Rahul', 'answer 1', 'answer 2', 'confirm']);
});

test('P0 interrupts a playing answer and the answer does not resume', async () => {
  const { player, log, s } = setup();
  s.enqueue(utt('long answer', 3, 'answer'));
  s.enqueue(utt('next sentence', 3, 'answer'));
  await flush();
  expect(player.playing).toBe('long answer');

  s.enqueue(utt('Car paas', 0, 'reflex'));
  await flush();
  expect(player.stops).toBe(1);
  expect(player.playing).toBe('Car paas');
  expect(log).toContain('end long answer interrupted');

  player.finish();
  await flush();
  expect(player.playing).toBe('next sentence'); // later sentences still play
  player.finish();
  await flush();
  expect(player.played.filter((p) => p === 'long answer')).toHaveLength(1);
});

test('P0 interrupt starts without waiting for the clip to end', async () => {
  const player = new FakePlayer();
  const starts: number[] = [];
  const s = new SpeechScheduler(player, { onStart: (_, at) => starts.push(at) }, clock);
  s.enqueue(utt('answer', 3, 'answer'));
  await flush();
  now = 1000;
  s.enqueue(utt('Bus aage', 0, 'reflex'));
  await flush();
  expect(starts).toEqual([0, 1000]);
});

test('P0 does not interrupt another P0', async () => {
  const { player, s } = setup();
  s.enqueue(utt('Car paas', 0, 'reflex'));
  await flush();
  s.enqueue(utt('Bus paas', 0, 'reflex'));
  await flush();
  expect(player.stops).toBe(0);
  expect(player.playing).toBe('Car paas');
});

test('P1 and P2 never cut the current clip', async () => {
  const { player, s } = setup();
  s.enqueue(utt('answer', 3, 'answer'));
  await flush();
  s.enqueue(utt('Rahul', 1, 'reflex'));
  s.enqueue(utt('Kursi', 2, 'reflex'));
  await flush();
  expect(player.stops).toBe(0);
  expect(player.playing).toBe('answer');
  player.finish();
  await flush();
  expect(player.playing).toBe('Rahul');
});

test('reflex older than 1.5 s at the head of the queue is dropped', async () => {
  const { player, log, s } = setup();
  s.enqueue(utt('answer', 3, 'answer'));
  await flush();
  s.enqueue(utt('Kursi aage', 2, 'reflex')); // created at t=0
  s.enqueue(utt('Kutta', 2, 'reflex', { createdAt: 1450 }));
  now = 1600;
  player.finish();
  await flush();
  expect(log).toContain('drop Kursi aage stale');
  expect(player.playing).toBe('Kutta'); // 150 ms old: still fresh
});

test('exactly 1.5 s old is not stale', async () => {
  const { player, s } = setup();
  s.enqueue(utt('answer', 3, 'answer'));
  await flush();
  s.enqueue(utt('Kursi', 2, 'reflex'));
  now = 1500;
  player.finish();
  await flush();
  expect(player.playing).toBe('Kursi');
});

test('answers, reading and system lines are never dropped as stale', async () => {
  const { player, log, s } = setup();
  s.enqueue(utt('first', 3, 'answer'));
  await flush();
  s.enqueue(utt('answer 2', 3, 'answer'));
  s.enqueue(utt('read 1', 3, 'reading'));
  s.enqueue(utt('saved', 4, 'system'));
  now = 60_000;
  for (let i = 0; i < 4; i++) {
    player.finish();
    await flush();
  }
  expect(log.filter((l) => l.startsWith('drop'))).toEqual([]);
  expect(player.played).toEqual(['first', 'answer 2', 'read 1', 'saved']);
});

test('alerts from the same frame coalesce, highest priority first, with a pause', async () => {
  const { player, s } = setup();
  s.enqueue(utt('answer', 3, 'answer'));
  await flush();
  s.enqueue(utt('Kursi aage', 2, 'reflex', { frameId: 7 }));
  s.enqueue(utt('Car left', 0, 'reflex', { frameId: 7 })); // P0 interrupts the answer
  await flush();
  expect(player.playing).toBe('Car left | Kursi aage');
});

test('coalescing keeps the 2 highest-priority objects', async () => {
  const { player, log, s } = setup();
  s.enqueue(utt('answer', 3, 'answer'));
  await flush();
  s.enqueue(utt('Gamla', 2, 'reflex', { frameId: 1 }));
  s.enqueue(utt('Kutta', 2, 'reflex', { frameId: 1 }));
  s.enqueue(utt('Sofa', 2, 'reflex', { frameId: 1 })); // tie: dropped, earlier ones stay
  s.enqueue(utt('Rahul', 1, 'reflex', { frameId: 1 })); // bumps the last P2
  expect(s.pending.map((g) => g.map((u) => label(u.parts)))).toEqual([['Rahul', 'Gamla']]);
  expect(log).toEqual(expect.arrayContaining(['drop Sofa coalesced_out', 'drop Kutta coalesced_out']));
  player.finish();
  await flush();
  expect(player.playing).toBe('Rahul | Gamla');
});

test('different frames do not coalesce; non-reflex never coalesces', async () => {
  const { s } = setup();
  s.enqueue(utt('playing', 4));
  s.enqueue(utt('Car', 2, 'reflex', { frameId: 1 }));
  s.enqueue(utt('Bus', 2, 'reflex', { frameId: 2 }));
  s.enqueue(utt('a1', 3, 'answer', { frameId: 1 }));
  expect(s.pending).toHaveLength(3);
});

test('a stale member of a coalesced group is dropped, the fresh one plays', async () => {
  const { player, log, s } = setup();
  s.enqueue(utt('answer', 3, 'answer'));
  await flush();
  s.enqueue(utt('Kursi', 2, 'reflex', { frameId: 3, createdAt: 0 }));
  s.enqueue(utt('Kutta', 2, 'reflex', { frameId: 3, createdAt: 1400 }));
  now = 1700;
  player.finish();
  await flush();
  expect(log).toContain('drop Kursi stale');
  expect(player.playing).toBe('Kutta');
});

test('stopAll clears the queue and stops the current utterance', async () => {
  const { log, s } = setup();
  s.enqueue(utt('a1', 3, 'answer'));
  s.enqueue(utt('a2', 3, 'answer'));
  await flush();
  s.stopAll();
  await flush();
  expect(log).toEqual(expect.arrayContaining(['drop a2 cleared', 'end a1 stopped']));
  expect(s.busy).toBe(false);
});

test('onIdle fires when everything has played', async () => {
  const { player, s } = setup();
  const idle = jest.fn();
  s.onIdle(idle);
  s.enqueue(utt('one', 4));
  await flush();
  expect(idle).not.toHaveBeenCalled();
  player.finish();
  await flush();
  expect(idle).toHaveBeenCalledTimes(1);
});

test('a player error ends the utterance and the queue continues', async () => {
  const log: string[] = [];
  let calls = 0;
  const player: Player = {
    play: async () => {
      if (++calls === 1) throw new Error('decode failed');
      return 'done';
    },
    stop: async () => {},
  };
  const s = new SpeechScheduler(player, { onEnd: (u, r) => log.push(`${label(u.parts)} ${r}`) }, clock);
  s.enqueue(utt('bad', 4));
  s.enqueue(utt('good', 4));
  await flush();
  await flush();
  expect(log).toEqual(['bad error', 'good done']);
});

test('cancelWhere drops matching queued utterances but not the playing one', async () => {
  const { player, log, s } = setup();
  s.enqueue(utt('a1', 3, 'answer', { id: 'ans' }));
  s.enqueue(utt('a2', 3, 'answer', { id: 'ans' }));
  s.enqueue(utt('other', 3, 'answer', { id: 'x' }));
  await flush();
  expect(s.cancelWhere((u) => u.id === 'ans')).toBe(1);
  expect(log).toContain('drop a2 cleared');
  expect(player.playing).toBe('a1');
  player.finish();
  await flush();
  expect(player.playing).toBe('other');
});

test('subscribe adds listeners; unsubscribe removes them', async () => {
  const { player, s } = setup();
  const ends: string[] = [];
  const off = s.subscribe({ onEnd: (u, r) => ends.push(`${u.id}:${r}`) });
  s.enqueue(utt('one', 4, 'system', { id: 'u-one' }));
  await flush();
  player.finish();
  await flush();
  off();
  s.enqueue(utt('two', 4, 'system', { id: 'u-two' }));
  await flush();
  player.finish();
  await flush();
  expect(ends).toEqual(['u-one:done']);
});

test('F12 onPlay: once per played entry with every coalesced member, after their onStart', async () => {
  const { player, log, s } = setup();
  s.subscribe({ onPlay: (members) => log.push(`play ${members.map((m) => label(m.parts)).join(' + ')}`) });
  s.enqueue(utt('busy', 4));
  s.enqueue(utt('car', 2, 'reflex', { frameId: 7 }));
  s.enqueue(utt('dog', 2, 'reflex', { frameId: 7 }));
  player.finish();
  await flush();
  expect(log.filter((l) => l.startsWith('play') || l.startsWith('start'))).toEqual(['start busy', 'play busy', 'start car', 'start dog', 'play car + dog']);
});
