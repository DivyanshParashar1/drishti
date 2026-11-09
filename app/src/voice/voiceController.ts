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
import type { EnrollmentDialog } from '../identity/enrollment';
import type { Reader } from '../reading/reader';
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
  /**
   * P14: on-device recognition while offline (commands only), or null if unavailable. It owns the
   * mic itself, so startMic isn't called for it.
   */
  startOfflineStt?(lang: Lang): { push(chunk: ArrayBuffer): void; finish(): Promise<SttResult>; cancel(): void } | null;
  /** Start the mic; chunks are 16 kHz 16-bit mono PCM. */
  startMic(onChunk: (pcm: ArrayBuffer) => void): Promise<void>;
  stopMic(): Promise<void>;
  /** Latest camera frame as a local JPEG ('ask': ≤ 512 px; 'full': full resolution for OCR), or null. */
  grabFrame(mode?: 'ask' | 'full'): Promise<string | null>;
  /** On-device OCR (F7) → paragraphs in reading order. */
  ocr(uri: string): Promise<string[]>;
  reading: Pick<Reader, 'state' | 'start' | 'pause' | 'resume' | 'next' | 'stop'>;
  ask(req: AskRequest, onEvent: (e: AskEvent) => void): Promise<void>;
  /** Write base64 MP3 to a local file and return its uri. */
  writeAudio(b64: string): Promise<string>;
  /** F10: replay the welcome + tutorial. */
  tutorial(): void;
  /** F8: switch the app language (persisted). */
  setLanguage(lang: Lang): Promise<void>;
  /** F4 save/delete/list dialog; while it waits for an answer, transcripts go to it. */
  dialog: Pick<EnrollmentDialog, 'wantsTranscript' | 'onTranscript' | 'save' | 'delete' | 'list'>;
  /** Recognised people in view now (F3), with where they are. */
  present(): readonly { person: NamedPerson; dir: Direction }[];
  haptic(): void;
  earcon(name: 'listen_start' | 'listen_stop' | 'error'): void;
  /** F12: switch demo mode / real-user mode (saved, with a spoken confirmation). */
  setDemoMode?(on: boolean): void;
}

/** What the user just said and what the router made of it, for the transcript bubble (F12). */
export interface Heard {
  seq: number;
  text: string; // '' when nothing was heard
  cmd: Command | 'dialog' | null; // null: didn't catch it
}

/** Commands that need the server; offline recognition handles everything else. */
const OFFLINE_NEEDS_NET = new Set<Command['kind']>(['question', 'describe', 'next']);

const ERROR_LINES = new Set<ClipKey>(['sys.didnt_hear', 'sys.answer_failed', 'sys.no_internet']);

export const MIN_HOLD_MS = 300; // shorter presses are taps (e.g. the debug triple-tap), not speech

type State = 'idle' | 'listening' | 'busy';

export class VoiceController {
  state: State = 'idle';
  lastTranscript = '';
  lastCommand: Command['kind'] | 'dialog' | null = null;
  /** F12: released and waiting for the transcript or the answer's first sentence. */
  thinking = false;
  /** F12: the last transcript and its command; shown on screen only, never logged. */
  heard: Heard | null = null;
  private heardSeq = 0;
  private glossListeners: ((id: string, text: string, en: string) => void)[] = [];
  private session: { push(chunk: ArrayBuffer): void; finish(): Promise<SttResult>; cancel(): void } | null = null;
  private offlineSession = false;
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

  /** F12: an answer sentence's English line arrived after the sentence (see AskEvent 'gloss'). */
  onGloss(cb: (id: string, text: string, en: string) => void): () => void {
    this.glossListeners.push(cb);
    return () => {
      this.glossListeners = this.glossListeners.filter((l) => l !== cb);
    };
  }

  /** F12 right temple, double-tap: stop all speech, like "ruko". */
  stopSpeech(): void {
    if (this.d.reading.state !== 'idle') this.d.reading.stop();
    this.d.scheduler.stopAll();
  }

  /** Drop a talk in progress without sending it (F12: a two-finger hold isn't a question). */
  async cancel(): Promise<void> {
    if (this.state !== 'listening') return;
    const session = this.session;
    this.session = null;
    this.state = 'idle';
    this.changed();
    session?.cancel();
    await this.d.stopMic().catch(() => undefined);
    if (this.d.reading.state === 'paused') this.d.reading.resume();
  }

  async pressIn(): Promise<void> {
    if (this.state === 'listening') return;
    this.d.haptic();
    this.d.reading.pause(); // F7: the next command decides (aage / ruko / anything else)
    this.d.scheduler.stopAll(); // the user is about to talk: stop speaking
    this.d.earcon('listen_start');
    this.pressedAt = this.clock();
    this.state = 'listening';
    this.changed();
    this.offlineSession = false;
    if (this.d.online() === false) {
      // P14: fixed commands still work offline with on-device recognition, if the phone has it.
      this.session = this.d.startOfflineStt?.(this.d.lang()) ?? null;
      this.offlineSession = this.session !== null;
      return; // without it, release says "no internet"
    }
    const session = this.d.startStt(this.d.lang());
    this.session = session;
    try {
      await this.d.startMic((pcm) => session.push(pcm));
    } catch {
      session.cancel();
      this.session = null;
    }
  }

  /** TalkBack's double-tap: start listening, or send what was said. */
  async toggle(): Promise<void> {
    if (this.state === 'listening') return this.pressOut();
    if (this.state === 'idle') return this.pressIn();
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
      const reading = this.d.reading.state === 'paused';
      if (held < MIN_HOLD_MS) {
        session?.cancel();
        if (reading) this.d.reading.resume(); // a tap: carry on reading
        return;
      }
      if (!session || (this.d.online() === false && !this.offlineSession)) {
        session?.cancel();
        if (reading && this.d.online() === false) return this.d.reading.stop(); // no STT offline: holding = stop
        this.say(this.d.online() === false ? 'sys.no_internet' : 'sys.didnt_hear');
        if (reading) this.d.reading.resume();
        return;
      }
      const id = this.d.metrics.start('describe', 'ptt_release');
      this.setThinking(true);
      const result = await session.finish();
      this.d.metrics.mark(id, 'stt_final');
      if (!result.ok) {
        this.setHeard('', null);
        this.d.metrics.note(id, result.code);
        this.say(this.d.online() === false && !this.offlineSession ? 'sys.no_internet' : 'sys.didnt_hear');
        if (reading) this.d.reading.resume();
        return;
      }
      this.lastTranscript = result.text;
      if (this.d.dialog.wantsTranscript) {
        this.setHeard(result.text, 'dialog');
        this.lastCommand = 'dialog';
        this.d.metrics.note(id, 'dialog');
        await this.d.dialog.onTranscript(result.text);
        return;
      }
      const cmd = route(result.text);
      this.setHeard(result.text, cmd.kind === 'empty' ? null : cmd);
      if (this.offlineSession && OFFLINE_NEEDS_NET.has(cmd.kind) && !(reading && cmd.kind === 'next')) {
        this.d.metrics.note(id, 'offline_question');
        this.say('sys.no_internet'); // P14: questions still need the VLM
        if (reading) this.d.reading.resume();
        return;
      }
      if (reading) {
        if (cmd.kind === 'next') return this.d.reading.next();
        this.d.reading.stop(); // "ruko" or any other command ends reading
        if (cmd.kind === 'stop') return;
      }
      await this.handle(cmd, id);
    } finally {
      this.state = 'idle';
      this.thinking = false;
      this.changed();
    }
  }

  async handle(cmd: Command, id: string): Promise<void> {
    this.lastCommand = cmd.kind;
    this.changed();
    if (cmd.kind !== 'describe' && cmd.kind !== 'question' && cmd.kind !== 'next') this.setThinking(false);
    switch (cmd.kind) {
      case 'demo':
        return this.d.setDemoMode?.(cmd.on);
      case 'empty':
        return this.say('sys.didnt_hear');
      case 'stop':
        return this.d.scheduler.stopAll();
      case 'quiet':
        this.d.reflex.setQuiet(cmd.on);
        return this.say(cmd.on ? 'sys.quiet_on' : 'sys.quiet_off');
      case 'repeat':
        if (this.lastAnswer.length === 0) return this.say('sys.nothing_to_repeat');
        // 'system' kind: a replay must not count towards the answer latency (F12 latency card).
        for (const parts of this.lastAnswer) this.enqueue(this.d.metrics.start('system', 'repeat'), 3, 'answer', parts);
        return;
      case 'who': {
        const here = this.d.present();
        if (here.length === 0) return this.say('sys.no_one_here');
        const lang = this.d.lang();
        for (const p of here) this.enqueue(this.d.metrics.start('system', 'enqueued'), 4, 'system', nameParts(p.person, lang, p.dir), lang);
        return;
      }
      case 'save':
        return this.d.dialog.save(cmd.name);
      case 'delete':
        return this.d.dialog.delete(cmd.name);
      case 'list':
        return this.d.dialog.list();
      case 'read':
        return this.readText(id);
      case 'next': // "aage" outside reading: a question about what's ahead
        return this.askQuestion(this.lastTranscript || 'aage', id);
      case 'help':
        return this.d.tutorial();
      case 'language':
        await this.d.setLanguage(cmd.lang);
        return this.say('sys.lang_switched'); // said in the new language
      case 'describe':
      case 'question':
        return this.askQuestion(cmd.question, id);
    }
  }

  private async askQuestion(question: string, id: string): Promise<void> {
    if (this.d.online() === false) {
      this.setThinking(false);
      return this.say('sys.no_internet');
    }
    const lang = this.d.lang();
    const imageUri = await this.d.grabFrame();
    if (!imageUri) {
      this.setThinking(false);
      this.d.metrics.note(id, 'no_frame');
      return this.say('sys.answer_failed');
    }
    // "Dekh rahi hoon" plays while we wait. Same priority as the answer (FIFO), so it never
    // follows the answer; if it hasn't started when sentence 1 lands, it's dropped.
    const lookingId = `${id}:looking`;
    this.enqueue(lookingId, 3, 'system', [{ kind: 'clip', key: 'sys.looking' }], lang);
    const detections = this.d.reflex.visible.map((t) => ({ cls: t.label, dir: t.dir }));
    const answer: AudioPart[][] = [];
    const byIndex = new Map<number, AudioPart>(); // for an English line that comes later
    let chain = Promise.resolve(); // sentence files are written in order, then enqueued in order
    let sentences = 0;
    this.d.metrics.mark(id, 'ask_sent');
    await this.d.ask({ question, lang, detections, names: this.d.present().map((p) => p.person.name), imageUri }, (e) => {
      chain = chain.then(async () => {
        if (e.type === 'sentence') {
          if (sentences++ === 0) {
            this.d.scheduler.cancelWhere((u) => u.id === lookingId);
            this.setThinking(false);
          }
          this.d.metrics.mark(id, 'first_sentence_rx');
          if (this.interrupted.has(id)) return; // F6: no resume after a hazard
          const en = e.en ? { en: e.en } : {};
          let part: AudioPart;
          try {
            part = e.audioB64 ? { kind: 'file', uri: await this.d.writeAudio(e.audioB64), text: e.text, ...en } : { kind: 'speak', text: e.text, ...en };
          } catch {
            part = { kind: 'speak', text: e.text, ...en };
          }
          byIndex.set(e.index, part);
          answer.push([part]);
          this.enqueue(id, 3, 'answer', [part], lang);
        } else if (e.type === 'gloss') {
          const part = byIndex.get(e.index);
          if (part && (part.kind === 'file' || part.kind === 'speak')) {
            part.en = e.en; // a repeat shows it too
            for (const l of this.glossListeners) l(id, part.text, e.en);
          }
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

  /** F7: full-resolution frame → on-device OCR → Reader. Works offline (speech instead of Timbre). */
  private async readText(id: string): Promise<void> {
    this.d.metrics.setKind(id, 'reading'); // F12 latency card: READ, not ANSWER
    this.d.metrics.note(id, 'read');
    const uri = await this.d.grabFrame('full');
    if (!uri) return this.say('sys.no_text');
    let paragraphs: string[] = [];
    try {
      paragraphs = await this.d.ocr(uri);
    } catch {
      paragraphs = [];
    }
    this.d.metrics.mark(id, 'ocr_done');
    if (paragraphs.length === 0) return this.say('sys.no_text');
    this.d.reading.start(paragraphs, id);
  }

  private say(key: ClipKey): void {
    if (ERROR_LINES.has(key)) this.d.earcon('error'); // F10: an earcon before every failure line
    this.enqueue(this.d.metrics.start('system', 'enqueued'), 4, 'system', [{ kind: 'clip', key }]);
  }

  private enqueue(id: string, priority: Priority, source: Utterance['source'], parts: AudioPart[], lang = this.d.lang()) {
    this.d.scheduler.enqueue({ id, priority, source, lang, parts, createdAt: this.clock() });
  }

  private setThinking(on: boolean) {
    if (this.thinking === on) return;
    this.thinking = on;
    this.changed();
  }

  private setHeard(text: string, cmd: Heard['cmd']) {
    this.heard = { seq: ++this.heardSeq, text, cmd };
    this.changed();
  }

  private changed() {
    for (const l of this.listeners) l();
  }
}
