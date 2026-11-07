import { ConnectivityAnnouncer } from '../announcer';

function setup() {
  jest.useFakeTimers({ now: 0 });
  const said: string[] = [];
  const a = new ConnectivityAnnouncer((k) => void said.push(k), () => Date.now()); // the fake clock
  const advance = (ms: number) => jest.advanceTimersByTime(ms);
  return { a, said, advance };
}

afterEach(() => jest.useRealTimers());

test('startup online is silent; a lasting drop and return are announced', () => {
  const { a, said, advance } = setup();
  a.onChange(true);
  advance(5000);
  expect(said).toEqual([]);
  a.onChange(false);
  advance(2999);
  expect(said).toEqual([]);
  advance(1);
  expect(said).toEqual(['sys.internet_lost']);
  advance(40_000);
  a.onChange(true);
  advance(3000);
  expect(said).toEqual(['sys.internet_lost', 'sys.internet_back']);
});

test('starting offline is announced', () => {
  const { a, said, advance } = setup();
  a.onChange(false);
  advance(3000);
  expect(said).toEqual(['sys.internet_lost']);
});

test('a blip shorter than 3 s is silent', () => {
  const { a, said, advance } = setup();
  a.onChange(true);
  advance(5000);
  a.onChange(false);
  advance(1000);
  a.onChange(true);
  advance(10_000);
  expect(said).toEqual([]);
});

test('flapping: at most one announcement per 30 s; the final state is said once the gap ends', () => {
  const { a, said, advance } = setup();
  a.onChange(true);
  advance(5000);
  a.onChange(false);
  advance(4000); // lost announced at 8 s; gap ends at 38 s
  for (let i = 0; i < 3; i++) {
    a.onChange(true);
    advance(4000);
    a.onChange(false);
    advance(4000);
  }
  a.onChange(true);
  advance(4000);
  expect(said).toEqual(['sys.internet_lost']); // t = 37 s: still inside the 30 s gap
  advance(1000);
  expect(said).toEqual(['sys.internet_lost', 'sys.internet_back']);
});

test('ending in the same state as last announced says nothing more', () => {
  const { a, said, advance } = setup();
  a.onChange(false);
  advance(3000);
  a.onChange(true);
  advance(4000);
  a.onChange(false);
  advance(60_000);
  expect(said).toEqual(['sys.internet_lost']);
});
