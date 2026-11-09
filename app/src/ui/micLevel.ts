import { Signal } from '../core/signal';

/** F12 waveform on the left temple: loudness of each mic chunk while listening, 0–1. */
export const micLevel = new Signal<[number]>();

/** RMS of 16-bit little-endian PCM (every 4th sample is plenty), scaled so speech fills the bar. */
export function pcmLevel(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 1 < bytes.byteLength; i += 8) {
    const v = view.getInt16(i, true);
    sum += v * v;
    n++;
  }
  return n ? Math.min(1, Math.sqrt(sum / n) / 6000) : 0;
}
