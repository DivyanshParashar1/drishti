import { File, Paths } from 'expo-file-system';
import type { GrabMode } from '../vision/useReflexCamera';

/** Bridges the camera (which can grab a JPEG) to the voice flow (which needs a file to upload). */
export class FrameGrabber {
  private impl: ((mode: GrabMode) => Promise<ArrayBuffer | null>) | null = null;
  private n = 0;

  set(impl: ((mode: GrabMode) => Promise<ArrayBuffer | null>) | null): void {
    this.impl = impl;
  }

  /** Latest frame written to a cache file; null if the camera isn't running or timed out. */
  async grabToFile(mode: GrabMode = 'ask'): Promise<string | null> {
    const jpeg = await this.impl?.(mode);
    if (!jpeg) return null;
    const file = new File(Paths.cache, `${mode}-${this.n++ % 4}.jpg`);
    await file.write(new Uint8Array(jpeg));
    return file.uri;
  }
}
