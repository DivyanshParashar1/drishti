/**
 * F12 gestures that sit beside hold-to-talk.
 *
 * - Two fingers held for 2 s anywhere toggles demo mode. The second finger landing cancels the
 *   talk the first finger started (onTwo), so the toggle never sends a question.
 * - Right temple: one tap repeats, two taps within `windowMs` stop. The tap fires only once the
 *   window has passed without a second tap.
 */
export class TwoFingerHold {
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Touch ends from a two-finger gesture must not count as debug taps. */
  private quietUntil = 0;

  constructor(
    private readonly d: { onTwo(): void; onFire(): void; now?: () => number },
    private readonly holdMs = 2000,
    private readonly quietMs = 400,
  ) {}

  /** Call on every touch start/end with how many fingers are down now. */
  touches(count: number): void {
    if (count >= 2) {
      this.quietUntil = Infinity;
      if (this.timer) return;
      this.d.onTwo();
      this.timer = setTimeout(() => {
        this.timer = null;
        this.d.onFire();
      }, this.holdMs);
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.quietUntil === Infinity) this.quietUntil = this.now() + this.quietMs;
  }

  /** False for touch ends that belong to a two-finger gesture (and just after it). */
  get countsAsTap(): boolean {
    return this.now() >= this.quietUntil;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private now() {
    return this.d.now?.() ?? performance.now();
  }
}

export function createTapOrDouble(onTap: () => void, onDouble: () => void, windowMs = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function tap(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      onDouble();
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      onTap();
    }, windowMs);
  };
}
