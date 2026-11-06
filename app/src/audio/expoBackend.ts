import { createAudioPlayer, preload, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import type { AudioBackend } from './clipPlayer';
import type { PlayOutcome } from './scheduler';

/** Safety net if the native side never reports the end of a clip (ms). */
const MAX_CLIP_MS = 30_000;

/**
 * expo-audio + expo-speech. One player is reused: `replace()` swaps sources, and preloaded
 * sources start near-instantly. Plays through the media stream, so the system volume applies.
 */
export class ExpoAudioBackend implements AudioBackend {
  private player: AudioPlayer;
  private finish: ((o: PlayOutcome) => void) | null = null;

  constructor() {
    this.player = createAudioPlayer(null, { updateInterval: 50 });
    this.player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) this.settle('done');
    });
  }

  static async configure(): Promise<void> {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
    });
  }

  playSource(source: number | string): Promise<PlayOutcome> {
    this.settle('stopped'); // never two at once
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settle('done'), MAX_CLIP_MS);
      this.finish = (o) => {
        clearTimeout(timer);
        resolve(o);
      };
      this.player.replace(typeof source === 'string' ? { uri: source } : source);
      this.player.play();
    });
  }

  speak(text: string, locale: string): Promise<PlayOutcome> {
    this.settle('stopped');
    return new Promise((resolve) => {
      this.finish = resolve;
      Speech.speak(text, {
        language: locale,
        onDone: () => this.settle('done'),
        onStopped: () => this.settle('stopped'),
        onError: () => this.settle('done'),
      });
    });
  }

  async stop(): Promise<void> {
    this.player.pause();
    this.settle('stopped'); // resolve first so the scheduler moves on within the 50 ms budget
    await Speech.stop();
  }

  async preload(source: number | string): Promise<void> {
    await preload(typeof source === 'string' ? { uri: source } : source);
  }

  private settle(o: PlayOutcome) {
    const f = this.finish;
    this.finish = null;
    f?.(o);
  }
}
