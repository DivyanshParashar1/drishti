/**
 * P17 hands-free end of speech: after the wake word there is no button release, so loudness
 * decides when the question is over.
 *
 * - Speech starts after `speechFrames` loud frames in a row (a level above the threshold).
 * - Once speech has started, `silenceMs` of quiet ends it → 'end'.
 * - No speech within `noSpeechMs` → 'no_speech' (the user said "Drishti" and nothing else).
 * - `maxMs` caps a turn → 'end'.
 * - The first `ignoreMs` are skipped: the listen earcon plays then and the mic hears it.
 *
 * The threshold adapts to the room: `noiseFloor × noiseRatio`, but never below `minLevel`. The
 * noise floor comes from the wake-word listening before this turn (see WakeService).
 */
export interface EndpointConfig {
  minLevel: number; // 0–1, pcmLevel scale
  noiseRatio: number;
  speechFrames: number;
  silenceMs: number;
  noSpeechMs: number;
  maxMs: number;
  ignoreMs: number;
}

export const ENDPOINT: EndpointConfig = {
  minLevel: 0.06,
  noiseRatio: 2.5,
  speechFrames: 3, // 3 × 32 ms Porcupine frames ≈ 100 ms of voice
  silenceMs: 900,
  noSpeechMs: 5000,
  maxMs: 10_000,
  ignoreMs: 250,
};

export type EndpointResult = 'continue' | 'end' | 'no_speech';

export class Endpointer {
  readonly threshold: number;
  private startedAt: number | null = null;
  private loudRun = 0;
  private speaking = false;
  private lastLoudAt = 0;

  constructor(
    noiseFloor: number,
    private readonly cfg: EndpointConfig = ENDPOINT,
  ) {
    this.threshold = Math.max(cfg.minLevel, noiseFloor * cfg.noiseRatio);
  }

  get heardSpeech(): boolean {
    return this.speaking;
  }

  /** One mic frame's level (0–1) at time `now` (ms). */
  feed(level: number, now: number): EndpointResult {
    if (this.startedAt === null) this.startedAt = now;
    const t = now - this.startedAt;
    if (t >= this.cfg.maxMs) return this.speaking ? 'end' : 'no_speech';
    if (t < this.cfg.ignoreMs) return 'continue';
    if (level >= this.threshold) {
      this.loudRun++;
      if (this.loudRun >= this.cfg.speechFrames) this.speaking = true;
      this.lastLoudAt = now;
    } else {
      this.loudRun = 0;
    }
    if (this.speaking) return now - this.lastLoudAt >= this.cfg.silenceMs ? 'end' : 'continue';
    return t >= this.cfg.noSpeechMs ? 'no_speech' : 'continue';
  }
}

/** Slow running average of the room's loudness while nobody is talking to Drishti. */
export class NoiseFloor {
  value: number;
  constructor(
    initial = 0.02,
    private readonly alpha = 0.02,
  ) {
    this.value = initial;
  }
  feed(level: number): void {
    // Loud moments (speech, the app's own voice) barely move it: only quieter frames pull it up fast.
    const a = level > this.value * 3 ? this.alpha / 10 : this.alpha;
    this.value += a * (level - this.value);
  }
}
