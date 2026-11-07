import type { ClipKey } from '../audio/clips.generated';
import type { AudioPart, Priority, SpeechScheduler, Utterance } from '../audio/scheduler';
import { monotonic, type Clock } from '../core/clock';
import type { Lang } from '../core/lang';
import type { Metrics } from '../core/metrics';
import { nameParts, type NamedPerson } from '../identity/identifier';
import type { AskEvent, AskRequest } from '../net/askClient';
import type { SttResult } from '../net/sttClient';
import type { Track } from '../vision/tracker';
import type { Direction } from '../vision/types';
import { route, type Command } from './router';

/** Everything the controller touches, injected so the whole flow is testable with fakes. */
export interface VoiceDeps {
  scheduler: Pick<SpeechScheduler, 'enqueue' | 'stopAll' | 'cancelWhere' | 'subscribe'>;
  metrics: Metrics;
  lang: () => Lang;
  online: () => boolean | null;
  reflex: { visible: readonly Track[]; quiet: boolean; setQuiet(on: boolean): void };
  /** Open an /stt session; PCM is pushed into it while the button is held. */
  startStt(lang: Lang): { push(chunk: ArrayBuffer): void; finish(): Promise<SttResult>; cancel(): void };
  /** Start the mic; chunks are 16 kHz 16-bit mono PCM. */
  startMic(onChunk: (pcm: ArrayBuffer) => void): Promise<void>;
  stopMic(): Promise<void>;
  /** Latest camera frame as a local JPEG (≤ 512 px), or null if none could be captured. */
  grabFrame(): Promise<string | null>;
  ask(req: AskRequest, onEvent: (e: AskEvent) => void): Promise<void>;
  /** Write base64 MP3 to a local file and return its uri. */
  writeAudio(b64: string): Promise<string>;
  /** Recognised people in view now (F3), with where they are. */
  present(): readonly { person: NamedPerson; dir: Direction }[];
  haptic(): void;
  earcon(name: 'listen_start' | 'listen_stop' | 'error'): void;
}

export const MIN_HOLD_MS = 300; // shorter presses are taps (e.g. the debug triple-tap), not speech

type State = 'idle' | 'listening' | 'busy';

export class VoiceController {
  state: State = 'idle';
  lastTranscript = '';
  lastCommand: Command['kind'] | null = null;
  private session: ReturnType<VoiceDeps['startStt']> | null = null;
  private pressedAt = 0;
  private lastAnswer: AudioPart[][] = [];
  private interrupted = new Set<string>();
  private listeners: (() => void)[] = [];

  constructor(
    private readonly d: VoiceDeps,
    private readonly clock: Clock = monotonic,
  ) {
    // F6: a hazard that interrupts an answer ends it; the rest of its sentences are dropped.
    d.scheduler.subscribe({
      onEnd: (u, reason) => {
        if (u.source === 'answer' && reason === 'interrupted') {
          this.interrupted.add(u.id);
          d.scheduler.cancelWhere((q) => q.id === u.id);
        }
      },
    });
  }

  onChange(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  async pressIn(): Promise<void> {
    if (this.state === 'listening') return;
    this.d.haptic();
    this.d.scheduler.stopAll(); // the user is about to talk: stop speaking
    this.d.earcon('listen_start');
    this.pressedAt = this.clock();
    this.state = 'listening';
    this.changed();
    if (this.d.online() === false) return; // no STT offline; release says "no internet"
    const session = this.d.startStt(this.d.lang());
    this.session = session;
    try {
      await this.d.startMic((pcm) => session.push(pcm));
    } catch {
      session.cancel();
      this.session = null;
    }
  }

  async pressOut(): Promise<void> {
    if (this.state !== 'listening') return;
    this.d.haptic();
    this.d.earcon('listen_stop');
    const held = this.clock() - this.pressedAt;
    const session = this.session;
    this.session = null;
    this.state = 'busy';
    this.changed();
    try {
      await this.d.stopMic().catch(() => undefined);
      if (held < MIN_HOLD_MS) {
        session?.cancel();
        return;
      }
      if (this.d.online() === false || !session) {
        session?.cancel();
        this.say(this.d.online() === false ? 'sys.no_internet' : 'sys.didnt_hear');
        return;
      }
      const id = this.d.metrics.start('describe', 'ptt_release');
      const result = await session.finish();
      this.d.metrics.mark(id, 'stt_final');
      if (!result.ok) {
        this.d.metrics.note(id, result.code);
        this.say(this.d.online() === false ? 'sys.no_internet' : 'sys.didnt_hear');
        return;
      }
      this.lastTranscript = result.text;
      await this.handle(route(result.text), id);
    } finally {
      this.state = 'idle';
      this.changed();
    }
  }

  async handle(cmd: Command, id: string): Promise<void> {
    this.lastCommand = cmd.kind;
    this.changed();
    switch (cmd.kind) {
      case 'empty':
        return this.say('sys.didnt_hear');
      case 'stop':
        return this.d.scheduler.stopAll();
      case 'quiet':
        this.d.reflex.setQuiet(cmd.on);
        return this.say(cmd.on ? 'sys.quiet_on' : 'sys.quiet_off');
      case 'repeat':
        if (this.lastAnswer.length === 0) return this.say('sys.nothing_to_repeat');
        for (const parts of this.lastAnswer) this.enqueue(this.d.metrics.start('describe', 'repeat'), 3, 'answer', parts);
        return;
      case 'who': {
        const here = this.d.present();
        if (here.length === 0) return this.say('sys.no_one_here');
        const lang = this.d.lang();
        for (const p of here) this.enqueue(this.d.metrics.start('system', 'enqueued'), 4, 'system', nameParts(p.person, lang, p.dir), lang);
        return;
      }
      case 'save':
      case 'delete':
      case 'list':
      case 'read':
      case 'language':
        return this.say('sys.not_available'); // P9 / P10 / P11
      case 'describe':
      case 'question':
        return this.askQuestion(cmd.question, id);
    }
  }

  private async askQuestion(question: string, id: string): Promise<void> {
    if (this.d.online() === false) return this.say('sys.no_internet');
    const lang = this.d.lang();
    const imageUri = await this.d.grabFrame();
    if (!imageUri) {
      this.d.metrics.note(id, 'no_frame');
      return this.say('sys.answer_failed');
    }
    // "Dekh rahi hoon" plays while we wait. Same priority as the answer (FIFO), so it never
    // follows the answer; if it hasn't started when sentence 1 lands, it's dropped.
    const lookingId = `${id}:looking`;
    this.enqueue(lookingId, 3, 'system', [{ kind: 'clip', key: 'sys.looking' }], lang);
    const detections = this.d.reflex.visible.map((t) => ({ cls: t.label, dir: t.dir, dist: t.dist }));
    const answer: AudioPart[][] = [];
    let chain = Promise.resolve(); // sentence files are written in order, then enqueued in order
    let sentences = 0;
    this.d.metrics.mark(id, 'ask_sent');
    await this.d.ask({ question, lang, detections, names: this.d.present().map((p) => p.person.name), imageUri }, (e) => {
      chain = chain.then(async () => {
        if (e.type === 'sentence') {
          if (sentences++ === 0) this.d.scheduler.cancelWhere((u) => u.id === lookingId);
          this.d.metrics.mark(id, 'first_sentence_rx');
          if (this.interrupted.has(id)) return; // F6: no resume after a hazard
          let parts: AudioPart[];
          try {
            parts = e.audioB64 ? [{ kind: 'file', uri: await this.d.writeAudio(e.audioB64), text: e.text }] : [{ kind: 'speak', text: e.text }];
          } catch {
            parts = [{ kind: 'speak', text: e.text }];
          }
          answer.push(parts);
          this.enqueue(id, 3, 'answer', parts, lang);
        } else if (e.type === 'done') {
          this.d.metrics.attachServer(id, e.timings);
        } else {
          this.d.metrics.note(id, e.code);
          if (e.timings) this.d.metrics.attachServer(id, e.timings);
          if (sentences === 0) this.say('sys.answer_failed');
        }
      });
    });
    await chain;
    if (answer.length) this.lastAnswer = answer;
  }

  private say(key: ClipKey): void {
    this.enqueue(this.d.metrics.start('system', 'enqueued'), 4, 'system', [{ kind: 'clip', key }]);
  }

  private enqueue(id: string, priority: Priority, source: Utterance['source'], parts: AudioPart[], lang = this.d.lang()) {
    this.d.scheduler.enqueue({ id, priority, source, lang, parts, createdAt: this.clock() });
  }

  private changed() {
    for (const l of this.listeners) l();
  }
}
