import { monotonic, type Clock } from '../core/clock';

/** Returns a tap() that is true on the n-th tap within windowMs (then resets). */
export function createTapCounter(n = 3, windowMs = 600, clock: Clock = monotonic) {
  let taps: number[] = [];
  return function tap(): boolean {
    const now = clock();
    taps = taps.filter((t) => now - t <= windowMs);
    taps.push(now);
    if (taps.length >= n) {
      taps = [];
      return true;
    }
    return false;
  };
}
