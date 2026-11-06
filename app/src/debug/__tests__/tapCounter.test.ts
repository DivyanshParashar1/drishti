import { createTapCounter } from '../tapCounter';

test('three quick taps trigger, then it resets', () => {
  let t = 0;
  const tap = createTapCounter(3, 600, () => t);
  expect([tap(), (t += 100, tap()), (t += 100, tap())]).toEqual([false, false, true]);
  t += 100;
  expect(tap()).toBe(false);
});

test('slow taps do not trigger', () => {
  let t = 0;
  const tap = createTapCounter(3, 600, () => t);
  tap();
  t += 400;
  tap();
  t += 400; // first tap is now 800 ms old
  expect(tap()).toBe(false);
  t += 100;
  expect(tap()).toBe(true); // taps at 400, 800, 900
});
