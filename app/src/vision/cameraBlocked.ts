/**
 * F10 dark / blocked camera: mean luminance below `threshold` for `holdMs` → warn ("Camera saaf
 * nahi dikh raha"), and again every `repeatMs` while it lasts. Clears once luminance is back above
 * threshold + hysteresis, so a flicker at the boundary doesn't re-trigger.
 */
export interface BlockedConfig {
  threshold: number;
  hysteresis: number;
  holdMs: number;
  repeatMs: number;
}

export const BLOCKED: BlockedConfig = { threshold: 0.08, hysteresis: 0.04, holdMs: 2000, repeatMs: 20_000 };

export class CameraBlockedMonitor {
  private darkSince: number | null = null;
  private lastWarnAt: number | null = null;
  blocked = false;

  constructor(private readonly cfg: BlockedConfig = BLOCKED) {}

  /** Feed one frame's luminance; returns true when the warning should be spoken now. */
  update(luma: number, now: number): boolean {
    if (luma >= this.cfg.threshold + this.cfg.hysteresis || (!this.blocked && luma >= this.cfg.threshold)) {
      this.darkSince = null;
      this.lastWarnAt = null;
      this.blocked = false;
      return false;
    }
    if (luma < this.cfg.threshold && this.darkSince === null) this.darkSince = now;
    if (this.darkSince === null || now - this.darkSince < this.cfg.holdMs) return false;
    this.blocked = true;
    if (this.lastWarnAt === null || now - this.lastWarnAt >= this.cfg.repeatMs) {
      this.lastWarnAt = now;
      return true;
    }
    return false;
  }
}
