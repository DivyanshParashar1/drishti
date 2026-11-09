import type { WakeEngine } from './wakeWord';

/**
 * P17 wake word with openWakeWord (Apache-2.0, on device, no account), run on the app's own
 * TFLite runtime. The same streaming steps as openWakeWord's AudioFeatures:
 *
 * 1. Every 80 ms chunk (1280 samples at 16 kHz), the melspectrogram model reads that chunk plus
 *    the 480 samples before it (1760) → 8 mel frames × 32, transformed x / 10 + 2.
 * 2. The embedding model reads the last 76 mel frames → one 96-d feature.
 * 3. The wake-word model reads the last 16 features → a score 0–1. ≥ threshold = heard.
 *
 * The mel buffer starts as ones (as openWakeWord does); no score until 16 features exist (~1.3 s
 * after start). After a detection the features are cleared, so one utterance fires once.
 * Validated on laptop with the same models: scripts/wake/check_pipeline.py.
 */
export const CHUNK = 1280;
export const HISTORY = 480;
export const MEL_FRAMES = 8;
export const MEL_BINS = 32;
export const MEL_WINDOW = 76;
export const EMBED_DIM = 96;
export const FEATURES = 16;

export interface OwwModels {
  /** 1760 samples (int16 values as float) → 8 × 32 raw mel values. */
  melspec(samples: Float32Array): Float32Array;
  /** 76 × 32 mel frames → 96 features. */
  embed(mel: Float32Array): Float32Array;
  /** 16 × 96 features → wake-word score. */
  classify(features: Float32Array): number;
}

export class OwwEngine implements WakeEngine {
  readonly frameLength = 640; // the recorder's 40 ms chunks; scored every 2nd
  readonly sampleRate = 16000;
  /** Last score, for the menu (0–1). */
  lastScore = 0;
  private window = new Float32Array(HISTORY + CHUNK); // [history | current chunk]
  private filled = 0; // samples of the current chunk so far
  private mel: Float32Array;
  private features: Float32Array[] = [];

  constructor(
    private readonly models: OwwModels,
    private readonly threshold = 0.5,
  ) {
    this.mel = new Float32Array(MEL_WINDOW * MEL_BINS).fill(1);
  }

  async process(frame: number[]): Promise<number> {
    return this.feed(frame) ? 0 : -1;
  }

  async delete(): Promise<void> {
    this.reset();
  }

  reset(): void {
    this.window.fill(0);
    this.filled = 0;
    this.mel.fill(1);
    this.features = [];
    this.lastScore = 0;
  }

  /** Feed samples; true if the wake word was heard in a chunk they completed. */
  feed(samples: ArrayLike<number>): boolean {
    let heard = false;
    for (let i = 0; i < samples.length; i++) {
      this.window[HISTORY + this.filled++] = samples[i];
      if (this.filled === CHUNK) {
        if (this.step()) heard = true;
        this.window.copyWithin(0, CHUNK); // the chunk's last 480 samples become history
        this.filled = 0;
      }
    }
    return heard;
  }

  private step(): boolean {
    const raw = this.models.melspec(this.window);
    // Shift the mel buffer by 8 frames and append the new ones, transformed.
    this.mel.copyWithin(0, MEL_FRAMES * MEL_BINS);
    const base = (MEL_WINDOW - MEL_FRAMES) * MEL_BINS;
    for (let k = 0; k < MEL_FRAMES * MEL_BINS; k++) this.mel[base + k] = raw[k] / 10 + 2;
    this.features.push(this.models.embed(this.mel).slice(0, EMBED_DIM));
    if (this.features.length > FEATURES) this.features.shift();
    if (this.features.length < FEATURES) return false;
    const input = new Float32Array(FEATURES * EMBED_DIM);
    this.features.forEach((f, i) => input.set(f, i * EMBED_DIM));
    this.lastScore = this.models.classify(input);
    if (this.lastScore < this.threshold) return false;
    this.features = []; // one detection per utterance
    return true;
  }
}
