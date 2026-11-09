import type { FrameSource } from './wakeWord';

/** The recorder calls, reduced to what the wake word needs (tests pass a fake). */
export interface PcmRecorder {
  /** Start the mic at 16 kHz mono 16-bit; `onPcm` gets little-endian PCM bytes as they arrive. */
  start(onPcm: (bytes: Uint8Array) => void): Promise<void>;
  stop(): Promise<void>;
}

/**
 * P17: the app's existing recorder (@siteed/audio-studio) as the wake word's frame source, cut
 * into fixed frames of `frameLength` samples. No new native module, so no APK rebuild.
 */
export class RecorderFrameSource implements FrameSource {
  private frames: ((f: number[]) => void)[] = [];
  private errors: ((e: { message: string }) => void)[] = [];
  private pending: number[] = [];
  private frameLength = 640;

  constructor(private readonly rec: PcmRecorder) {}

  async start(frameLength: number, sampleRate: number): Promise<void> {
    if (sampleRate !== 16000) throw new Error(`the recorder runs at 16 kHz, not ${sampleRate}`);
    this.frameLength = frameLength;
    this.pending = [];
    try {
      await this.rec.start((bytes) => this.push(bytes));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      for (const cb of this.errors) cb({ message });
      throw e;
    }
  }

  async stop(): Promise<void> {
    this.pending = [];
    await this.rec.stop();
  }

  addFrameListener(cb: (f: number[]) => void): void {
    this.frames.push(cb);
  }
  removeFrameListener(cb: (f: number[]) => void): void {
    this.frames = this.frames.filter((l) => l !== cb);
  }
  addErrorListener(cb: (e: { message: string }) => void): void {
    this.errors.push(cb);
  }
  removeErrorListener(cb: (e: { message: string }) => void): void {
    this.errors = this.errors.filter((l) => l !== cb);
  }

  /** Bytes → int16 samples → whole frames (a remainder waits for the next chunk). */
  push(bytes: Uint8Array): void {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i + 1 < bytes.byteLength; i += 2) this.pending.push(view.getInt16(i, true));
    while (this.pending.length >= this.frameLength) {
      const frame = this.pending.splice(0, this.frameLength);
      for (const cb of this.frames) cb(frame);
    }
  }
}
