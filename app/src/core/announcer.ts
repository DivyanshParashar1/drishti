import type { ClipKey } from '../audio/clips.generated';

/**
 * F10 connectivity announcements without flapping spam:
 * - A change is announced only if it still holds `holdMs` later (a blip is silent).
 * - At most one announcement per `minGapMs`; a change inside the gap is announced when the gap
 *   ends, if it still holds and differs from what was last said.
 * - Startup: going online is silent; starting offline is announced (alerts still work).
 */
export class ConnectivityAnnouncer {
  private current: boolean | null = null;
  private said: boolean | null = null;
  private lastAt = -Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly say: (key: ClipKey) => void,
    private readonly now: () => number = () => performance.now(),
    private readonly holdMs = 3000,
    private readonly minGapMs = 30_000,
  ) {}

  onChange(online: boolean): void {
    this.current = online;
    this.schedule(this.holdMs);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.check(), ms);
  }

  private check() {
    this.timer = null;
    const online = this.current;
    if (online === null || online === this.said) return;
    if (this.said === null && online) {
      this.said = true; // first known state is online: nothing to say
      return;
    }
    const wait = this.lastAt + this.minGapMs - this.now();
    if (wait > 0) return this.schedule(wait);
    this.said = online;
    this.lastAt = this.now();
    this.say(online ? 'sys.internet_back' : 'sys.internet_lost');
  }
}
