import { createTapOrDouble, TwoFingerHold } from '../gestures';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('two fingers for 2 s fire once; the talk is cancelled when the second finger lands', () => {
  let now = 0;
  const log: string[] = [];
  const g = new TwoFingerHold({ onTwo: () => log.push('two'), onFire: () => log.push('fire'), now: () => now });
  g.touches(1);
  expect(g.countsAsTap).toBe(true);
  g.touches(2);
  g.touches(2); // another touch event while held: no restart
  jest.advanceTimersByTime(1999);
  expect(log).toEqual(['two']);
  jest.advanceTimersByTime(1);
  expect(log).toEqual(['two', 'fire']);
  expect(g.countsAsTap).toBe(false);
  g.touches(1);
  g.touches(0);
  expect(g.countsAsTap).toBe(false); // the fingers lifting aren't debug taps
  now = 400;
  expect(g.countsAsTap).toBe(true);
});

test('lifting a finger before 2 s cancels', () => {
  const log: string[] = [];
  const g = new TwoFingerHold({ onTwo: () => log.push('two'), onFire: () => log.push('fire') });
  g.touches(2);
  jest.advanceTimersByTime(1500);
  g.touches(1);
  jest.advanceTimersByTime(5000);
  expect(log).toEqual(['two']);
});

test('tap waits out the window; a second tap inside it is a double', () => {
  const log: string[] = [];
  const tap = createTapOrDouble(() => log.push('tap'), () => log.push('double'));
  tap();
  jest.advanceTimersByTime(300);
  tap();
  jest.advanceTimersByTime(100);
  tap();
  jest.advanceTimersByTime(1000);
  expect(log).toEqual(['tap', 'double']);
});
