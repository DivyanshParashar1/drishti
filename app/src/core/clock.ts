/** Monotonic milliseconds. Never mix with server clocks in one duration (spec §8). */
export type Clock = () => number;
export const monotonic: Clock = () => performance.now();
