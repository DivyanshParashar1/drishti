import { CLIPS } from '../audio/clips.generated';
import type { SchedulerHooks, Utterance } from '../audio/scheduler';
import { monotonic, type Clock } from '../core/clock';
import { Endpointer, NoiseFloor, type EndpointConfig } from './endpointer';

/** The wake-word detector (openWakeWord, src/voice/oww.ts), reduced to what the service uses. */
export interface WakeEngine {
  frameLength: number;
  sampleRate: number;
  /** Index of the keyword heard in this frame, or −1. */
  process(frame: number[]): Promise<number>;
  /** Forget buffered audio (after a turn, when the stream had a gap). */
  reset?(): void;
  delete(): Promise<void>;
}

/** The mic, delivering frames of 16-bit samples to JS (RecorderFrameSource). */
export interface FrameSource {
  start(frameLength: number, sampleRate: number): Promise<void>;
  stop(): Promise<void>;
  addFrameListener(cb: (frame: number[]) => void): void;
  removeFrameListener(cb: (frame: number[]) => void): void;
  addErrorListener(cb: (error: { message: string }) => void): void;
  removeErrorListener(cb: (error: { message: string }) => void): void;
}

/** The parts of VoiceController the wake word drives. */
export interface WakeTarget {
  readonly state: 'idle' | 'listening' | 'busy';
  /** Start listening as if the screen were pressed (earcon, speech stops, mic → STT). */
  wake(): Promise<void>;
  pressOut(): Promise<void>;
  cancel(): Promise<void>;
  onChange(cb: () => void): () => void;
}

export type WakeStatus =
  | { state: 'off' }
  | { state: 'no_key' } // no wake-word model configured
  | { state: 'starting' }
  | { state: 'listening' }
  | { state: 'paused' } // the offline recognizer has the mic
  | { state: 'error'; message: string };

export interface WakeDeps {
  /** Loads the wake-word models; throws if they can't load. */
  createEngine(): Promise<WakeEngine>;
  source: FrameSource;
  target: WakeTarget;
  scheduler: { subscribe(h: SchedulerHooks): () => void };
  /** Said when "Drishti" was heard but no question followed. */
  noSpeech(): void;
  /** Is the network up? Offline, the on-device recognizer takes the mic and ends the turn itself. */
  online(): boolean | null;
  /** Whether a key and keyword are configured at all (else status no_key, nothing starts). */
  configured: boolean;
}

/** What the app and the voice controller use, whichever engine listens (openWakeWord or Vosk). */
export interface WakeControl {
  readonly status: WakeStatus;
  readonly on: boolean;
  /** The phrase to say, for the menu. */
  readonly phrase: string;
  /** True when turns read the mic through tap() (openWakeWord); false when the engine must let go (Vosk). */
  readonly ownsMic: boolean;
  onStatus(cb: () => void): () => void;
  enable(on: boolean): Promise<void>;
  tap(cb: (pcm: ArrayBuffer, level: number) => void): void;
  untap(): void;
  /** Free the mic before the recorder opens it (hold-to-talk or a wake turn); taken back after the turn. */
  releaseMic(): Promise<void>;
  /** The offline recognizer needs the mic. */
  suspend(): Promise<void>;
  dispose(): Promise<void>;
}

/** After a turn, ignore the wake word briefly (the answer's first words, the stop earcon). */
export const REFRACTORY_MS = 1500;
/** Offline hands-free turns get a fixed window: the recognizer owns the mic, so no loudness. */
export const OFFLINE_TURN_MS = 5000;
/** The app saying its own name ("Namaste, main Drishti hoon") must not wake itself. */
export const SELF_NAME = /drishti|दृष्टि|दृष्टी|திருஷ்டி|দৃষ্টি|దృష్టి|ದೃಷ್ಟಿ|ദൃഷ്ടി|દ્રષ્ટિ|ਦ੍ਰਿਸ਼ਟੀ/i;

const frameLevel = (frame: number[]): number => {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < frame.length; i += 4) {
    sum += frame[i] * frame[i];
    n++;
  }
  return n ? Math.min(1, Math.sqrt(sum / n) / 6000) : 0; // same scale as micLevel.pcmLevel
};

export function toPcmBytes(frame: number[]): ArrayBuffer {
  const pcm = new Int16Array(frame.length);
  for (let i = 0; i < frame.length; i++) pcm[i] = frame[i];
  return pcm.buffer; // little-endian on every Android ABI
}

/**
 * P17 wake word (openWakeWord, on device, works offline).
 *
 * While on, it owns the mic: every frame goes to the detector, and while a turn is open (after the
 * wake word, or while the screen is held) the same frames go to STT through `tap()`, so the
 * hold-to-talk recorder and the wake word never fight over the microphone. A wake-word turn ends
 * by loudness (Endpointer): 0.9 s of quiet after speech sends the question; nothing said in 5 s
 * cancels with "Samajh nahi aaya".
 */
export class WakeService implements WakeControl {
  status: WakeStatus = { state: 'off' };
  private engine: WakeEngine | null = null;
  private running = false;
  private suspended = false;
  private tapCb: ((pcm: ArrayBuffer, level: number) => void) | null = null;
  private endpointer: Endpointer | null = null;
  private offlineTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly noise = new NoiseFloor();
  private selfSpeaking = false;
  private quietUntil = 0;
  private chain: Promise<void> = Promise.resolve();
  private listeners: (() => void)[] = [];
  private offs: (() => void)[] = [];

  constructor(
    private readonly d: WakeDeps,
    private readonly clock: Clock = monotonic,
    private readonly endpoint?: EndpointConfig,
    readonly phrase = 'Hey Jarvis',
  ) {
    this.offs.push(
      d.scheduler.subscribe({
        onPlay: (members) => (this.selfSpeaking = members.some(mentionsName)),
        onEnd: () => (this.selfSpeaking = false),
      }),
      d.target.onChange(() => this.onTargetChange()),
    );
  }

  /** True while the wake word has the mic, so the voice controller should use tap() instead of its recorder. */
  get ownsMic(): boolean {
    return this.running && !this.suspended;
  }

  get on(): boolean {
    return this.status.state !== 'off' && this.status.state !== 'no_key' && this.status.state !== 'error';
  }

  onStatus(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  async enable(on: boolean): Promise<void> {
    if (on) return this.start();
    return this.stop();
  }

  /** Mic frames for a turn (hold-to-talk or wake word) as 16 kHz 16-bit PCM, with their level. */
  tap(cb: (pcm: ArrayBuffer, level: number) => void): void {
    this.tapCb = cb;
  }

  untap(): void {
    this.tapCb = null;
    this.engine?.reset?.(); // the turn's audio never reached it: start the stream afresh
    this.endpointer = null;
    this.clearOfflineTimer();
    this.quietUntil = this.clock() + REFRACTORY_MS;
  }

  /** Turns read this engine's stream through tap(), so there is nothing to free. */
  async releaseMic(): Promise<void> {}

  /** The offline recognizer needs the mic: let it go until the turn is over. */
  async suspend(): Promise<void> {
    if (!this.running || this.suspended) return;
    this.suspended = true;
    this.set({ state: 'paused' });
    await this.d.source.stop().catch(() => undefined);
  }

  async dispose(): Promise<void> {
    for (const off of this.offs) off();
    await this.stop();
  }

  private async start(): Promise<void> {
    if (this.running) return;
    if (!this.d.configured) return this.set({ state: 'no_key' });
    this.set({ state: 'starting' });
    try {
      this.engine ??= await this.d.createEngine();
      this.d.source.addFrameListener(this.onFrame);
      this.d.source.addErrorListener(this.onError);
      await this.d.source.start(this.engine.frameLength, this.engine.sampleRate);
      this.running = true;
      this.suspended = false;
      this.set({ state: 'listening' });
    } catch (e) {
      this.detach();
      this.set({ state: 'error', message: messageOf(e) });
    }
  }

  private async stop(): Promise<void> {
    const wasRunning = this.running;
    this.running = false;
    this.suspended = false;
    this.detach();
    if (wasRunning) await this.d.source.stop().catch(() => undefined);
    if (this.engine) {
      const e = this.engine;
      this.engine = null;
      await e.delete().catch(() => undefined);
    }
    this.set({ state: 'off' });
  }

  private detach() {
    this.d.source.removeFrameListener(this.onFrame);
    this.d.source.removeErrorListener(this.onError);
    this.tapCb = null;
    this.endpointer = null;
    this.clearOfflineTimer();
  }

  private readonly onError = (error: { message: string }) => {
    this.set({ state: 'error', message: error.message });
  };

  private readonly onFrame = (frame: number[]) => {
    if (!this.running || this.suspended) return;
    const level = frameLevel(frame);
    if (this.tapCb) {
      this.tapCb(toPcmBytes(frame), level);
      const ep = this.endpointer;
      if (ep) {
        const r = ep.feed(level, this.clock());
        if (r === 'end') {
          this.endpointer = null;
          void this.d.target.pressOut();
        } else if (r === 'no_speech') {
          this.endpointer = null;
          void this.d.target.cancel().then(() => this.d.noSpeech());
        }
      }
      return;
    }
    this.noise.feed(level);
    const engine = this.engine;
    if (!engine) return;
    // Every frame reaches the detector, in order (openWakeWord reads a continuous stream); only
    // whether a detection counts is gated.
    this.chain = this.chain
      .then(() => engine.process(frame))
      .then((k) => {
        const allowed = this.d.target.state === 'idle' && !this.tapCb && !this.selfSpeaking && this.clock() >= this.quietUntil;
        if (k >= 0 && allowed) void this.trigger();
      })
      .catch((e) => this.set({ state: 'error', message: messageOf(e) }));
  };

  /** "Drishti" heard: open a hands-free turn. */
  private async trigger(): Promise<void> {
    const offline = this.d.online() === false;
    this.endpointer = offline ? null : new Endpointer(this.noise.value, this.endpoint);
    await this.d.target.wake(); // → startMic → tap() (online), or suspend() (offline recognizer)
    if (!this.tapCb) this.endpointer = null; // the turn didn't open (or went offline): don't end a later hold
    if (offline && this.d.target.state === 'listening') {
      this.offlineTimer = setTimeout(() => {
        this.offlineTimer = null;
        void this.d.target.pressOut();
      }, OFFLINE_TURN_MS);
    }
  }

  private clearOfflineTimer() {
    if (this.offlineTimer) clearTimeout(this.offlineTimer);
    this.offlineTimer = null;
  }

  /** The turn is over: take the mic back from the offline recognizer. */
  private onTargetChange() {
    if (this.d.target.state !== 'idle') return;
    this.clearOfflineTimer();
    if (this.suspended && this.running && this.engine) {
      this.suspended = false;
      this.quietUntil = this.clock() + REFRACTORY_MS;
      void this.d.source
        .start(this.engine.frameLength, this.engine.sampleRate)
        .then(() => this.set({ state: 'listening' }))
        .catch((e) => this.set({ state: 'error', message: messageOf(e) }));
    }
  }

  private set(s: WakeStatus) {
    this.status = s;
    for (const l of this.listeners) l();
  }
}

export function mentionsName(u: Utterance): boolean {
  return u.parts.some((p) => {
    if (p.kind === 'clip') return SELF_NAME.test(CLIPS[u.lang][p.key].text);
    if (p.kind === 'file' || p.kind === 'speak') return SELF_NAME.test(p.text);
    return false;
  });
}

export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Menu line for a status. */
export function wakeStatusText(s: WakeStatus, phrase: string): string {
  switch (s.state) {
    case 'off':
      return 'off';
    case 'no_key':
      return 'not set up: no wake-word model';
    case 'starting':
      return 'starting…';
    case 'listening':
      return `listening for “${phrase}”`;
    case 'paused':
      return 'paused while offline recognition runs';
    case 'error':
      return `error: ${s.message}`;
  }
}
