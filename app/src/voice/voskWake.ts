import type { SchedulerHooks } from '../audio/scheduler';
import { monotonic, type Clock } from '../core/clock';
import { Endpointer, type EndpointConfig } from './endpointer';
import { mentionsName, messageOf, OFFLINE_TURN_MS, REFRACTORY_MS, type WakeControl, type WakeStatus, type WakeTarget } from './wakeWord';

/** react-native-vosk, reduced to what the wake word uses (tests pass a fake). */
export interface VoskApi {
  loadModel(path: string): Promise<void>;
  start(options: { grammar: string[] }): Promise<void>;
  stop(): void;
  onResult(cb: (text: string) => void): { remove(): void };
  onPartialResult(cb: (text: string) => void): { remove(): void };
  onError(cb: (e: unknown) => void): { remove(): void };
}

/** The bundled model folder (app.config.ts → react-native-vosk plugin → APK assets). */
export const VOSK_MODEL = 'model-hi';
export const WAKE_WORD = 'दृष्टि';
/**
 * Only these words can be recognised. The look-alikes give near misses somewhere else to go:
 * without them "दृश्य" (drishya) woke it on the laptop test; with them it didn't.
 */
export const GRAMMAR = [WAKE_WORD, 'दृश्य', 'कृष्णा', 'दृष्टिकोण', '[unk]'];
/** Let the native recorder close before the app's recorder opens the mic. */
export const MIC_HANDOFF_MS = 150;

export interface VoskWakeDeps {
  vosk: VoskApi;
  target: WakeTarget;
  scheduler: { subscribe(h: SchedulerHooks): () => void };
  /** Loudness of the app's recorder while a turn records (micLevel), for the end of a wake turn. */
  micLevel: { on(cb: (level: number) => void): () => void };
  noSpeech(): void;
  online(): boolean | null;
  sleep?(ms: number): Promise<void>;
}

/**
 * P17 wake word "दृष्टि" with Vosk (free, offline, no training): the small Hindi model, limited
 * to a few words, runs on its own mic. Vosk returns text, not audio, so it can't share the mic:
 * it lets go before every turn (wake word, hold-to-talk, offline recognizer) and listens again
 * once the turn is over. A wake turn ends by loudness from the app's recorder (Endpointer).
 */
export class VoskWake implements WakeControl {
  status: WakeStatus = { state: 'off' };
  readonly phrase = 'Drishti (दृष्टि)';
  readonly ownsMic = false;
  private loaded = false;
  private running = false; // enabled by the user
  private listening = false; // Vosk has the mic now
  private selfSpeaking = false;
  private quietUntil = 0;
  private endpointer: Endpointer | null = null;
  private offlineTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: (() => void)[] = [];
  private subs: { remove(): void }[] = [];
  private offs: (() => void)[] = [];
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly d: VoskWakeDeps,
    private readonly clock: Clock = monotonic,
    private readonly endpoint?: EndpointConfig,
  ) {
    this.sleep = d.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.offs.push(
      d.scheduler.subscribe({
        onPlay: (members) => (this.selfSpeaking = members.some(mentionsName)),
        onEnd: () => (this.selfSpeaking = false),
      }),
      d.target.onChange(() => this.onTargetChange()),
      d.micLevel.on((level) => this.onLevel(level)),
    );
  }

  get on(): boolean {
    return this.running;
  }

  onStatus(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  async enable(on: boolean): Promise<void> {
    if (!on) {
      this.running = false;
      this.stopListening();
      this.clearOfflineTimer();
      this.endpointer = null;
      return this.set({ state: 'off' });
    }
    if (this.running) return;
    this.running = true;
    this.set({ state: 'starting' });
    try {
      if (!this.loaded) {
        await this.d.vosk.loadModel(VOSK_MODEL); // first run unpacks the model to storage (a few seconds)
        this.loaded = true;
      }
      if (this.subs.length === 0) {
        this.subs.push(
          this.d.vosk.onPartialResult((t) => this.heard(t)),
          this.d.vosk.onResult((t) => this.heard(t)),
          this.d.vosk.onError((e) => this.set({ state: 'error', message: messageOf(e) })),
        );
      }
      if (this.d.target.state === 'idle') await this.listen();
      else this.set({ state: 'paused' }); // a turn is open: listen when it ends
    } catch (e) {
      this.running = false;
      this.set({ state: 'error', message: messageOf(e) });
    }
  }

  tap(): void {}
  untap(): void {}

  async releaseMic(): Promise<void> {
    if (!this.listening) return;
    this.stopListening();
    if (this.running) this.set({ state: 'paused' });
    await this.sleep(MIC_HANDOFF_MS);
  }

  suspend(): Promise<void> {
    return this.releaseMic();
  }

  async dispose(): Promise<void> {
    for (const off of this.offs) off();
    for (const s of this.subs) s.remove();
    this.subs = [];
    await this.enable(false);
  }

  private async listen(): Promise<void> {
    if (!this.running || this.listening) return;
    this.listening = true;
    try {
      await this.d.vosk.start({ grammar: GRAMMAR });
      this.set({ state: 'listening' });
    } catch (e) {
      this.listening = false;
      this.set({ state: 'error', message: messageOf(e) });
    }
  }

  private stopListening() {
    if (!this.listening) return;
    this.listening = false;
    try {
      this.d.vosk.stop();
    } catch {
      // already stopped
    }
  }

  /** A partial or final result: only the wake word, heard while idle, counts. */
  private heard(text: string) {
    if (!this.listening || !text.split(/\s+/).includes(WAKE_WORD)) return;
    if (this.d.target.state !== 'idle' || this.selfSpeaking || this.clock() < this.quietUntil) return;
    void this.trigger();
  }

  private async trigger(): Promise<void> {
    await this.releaseMic();
    const offline = this.d.online() === false;
    this.endpointer = offline ? null : new Endpointer(0.02, this.endpoint);
    await this.d.target.wake(); // → startMic → the app's recorder (or the offline recognizer)
    if (this.d.target.state !== 'listening') {
      this.endpointer = null;
      return;
    }
    if (offline) {
      this.offlineTimer = setTimeout(() => {
        this.offlineTimer = null;
        void this.d.target.pressOut();
      }, OFFLINE_TURN_MS);
    }
  }

  private onLevel(level: number) {
    const ep = this.endpointer;
    if (!ep || this.d.target.state !== 'listening') return;
    const r = ep.feed(level, this.clock());
    if (r === 'end') {
      this.endpointer = null;
      void this.d.target.pressOut();
    } else if (r === 'no_speech') {
      this.endpointer = null;
      void this.d.target.cancel().then(() => this.d.noSpeech());
    }
  }

  /** The turn is over: listen again (ignoring the wake word for a moment). */
  private onTargetChange() {
    if (this.d.target.state !== 'idle') return;
    this.endpointer = null;
    this.clearOfflineTimer();
    if (this.running && !this.listening) {
      this.quietUntil = this.clock() + REFRACTORY_MS;
      void this.listen();
    }
  }

  private clearOfflineTimer() {
    if (this.offlineTimer) clearTimeout(this.offlineTimer);
    this.offlineTimer = null;
  }

  private set(s: WakeStatus) {
    this.status = s;
    for (const l of this.listeners) l();
  }
}
