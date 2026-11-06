import { File, Paths } from 'expo-file-system';

/** Bridges the camera (which can grab a JPEG) to the voice flow (which needs a file to upload). */
export class FrameGrabber {
  private impl: (() => Promise<ArrayBuffer | null>) | null = null;
  private n = 0;

  set(impl: (() => Promise<ArrayBuffer | null>) | null): void {
    this.impl = impl;
  }

  /** Latest frame written to a cache file; null if the camera isn't running or timed out. */
  async grabToFile(): Promise<string | null> {
    const jpeg = await this.impl?.();
    if (!jpeg) return null;
    const file = new File(Paths.cache, `ask-${this.n++ % 4}.jpg`);
    await file.write(new Uint8Array(jpeg));
    return file.uri;
  }
}
