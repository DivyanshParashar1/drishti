import type { AudioPart, SpeechScheduler, Utterance } from '../audio/scheduler';
import type { Lang } from '../core/lang';
import type { Metrics } from '../core/metrics';
import type { TtsResult } from '../net/ttsClient';
import { chunkText } from './chunk';

export interface ReaderDeps {
  scheduler: Pick<SpeechScheduler, 'enqueue' | 'subscribe'>;
  metrics: Metrics;
  lang: () => Lang;
  online: () => boolean | null;
  tts(text: string, lang: Lang): Promise<TtsResult>;
  /** Write a chunk's MP3 to a (rotating) file and return its uri. */
  writeAudio(mp3: ArrayBuffer): Promise<string>;
}

export type ReaderState = 'idle' | 'playing' | 'paused';

interface Chunk {
  block: number;
  text: string;
}

/**
 * F7 playback: paragraphs → ≤ 200-char chunks, each fetched from /tts (Timbre) with the next one
 * prefetched while the current plays. Offline, or if a fetch fails, the chunk is spoken with
 * expo-speech. One chunk is queued at a time (P3, source "reading"), so alerts slot in between.
 *
 * - A hazard (P0) cutting a chunk replays that chunk afterwards (reading resumes; unlike answers).
 * - pause(): the user pressed talk. The voice flow then calls next() ("aage": next paragraph),
 *   resume() (a tap, or STT failed), or stop() ("ruko", or any other command).
 * - At the end: "Bas itna hi likha hai".
 */
export class Reader {
  state: ReaderState = 'idle';
  private chunks: Chunk[] = [];
  private i = 0;
  private id = '';
  private session = 0;
  private current: Utterance | null = null;
  private audio = new Map<number, Promise<AudioPart>>();
  private listeners: (() => void)[] = [];

  constructor(private readonly d: ReaderDeps) {
    d.scheduler.subscribe({
      onEnd: (u, reason) => {
        if (u !== this.current) return;
        this.current = null;
        if (reason === 'done' || reason === 'error') {
          if (this.state === 'playing') return this.advance(this.i + 1);
          this.i++; // finished just as the user pressed: resume continues after it
          return;
        }
        if (this.state !== 'playing') return; // paused: stay on this chunk
        if (reason === 'interrupted') return void this.play(); // hazard: read this chunk again
        this.setState('paused'); // stopped by something else (stopAll)
      },
      onDrop: (u) => {
        if (u !== this.current) return;
        this.current = null;
        if (this.state === 'playing') this.setState('paused');
      },
    });
  }

  /** Where we are, for the debug overlay. */
  get progress(): { chunk: number; chunks: number; block: number } {
    return { chunk: this.i, chunks: this.chunks.length, block: this.chunks[this.i]?.block ?? -1 };
  }

  onChange(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  start(paragraphs: string[], metricId: string): void {
    this.stop();
    this.session++;
    this.id = metricId;
    this.chunks = paragraphs.flatMap((p, block) => chunkText(p).map((text) => ({ block, text })));
    if (this.chunks.length === 0) return;
    this.i = 0;
    this.setState('playing');
    void this.play();
  }

  pause(): void {
    if (this.state === 'playing') this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.setState('playing');
    if (!this.current) this.advance(this.i);
  }

  /** "aage": skip the rest of this paragraph. */
  next(): void {
    if (this.state === 'idle') return;
    const block = this.chunks[this.i]?.block ?? -1;
    let j = this.i;
    while (j < this.chunks.length && this.chunks[j].block === block) j++;
    this.setState('playing');
    this.advance(j);
  }

  stop(): void {
    this.session++;
    this.current = null;
    this.audio.clear();
    this.chunks = [];
    this.setState('idle');
  }

  private advance(j: number) {
    this.i = j;
    if (j >= this.chunks.length) {
      this.stop();
      const id = this.d.metrics.start('system', 'enqueued');
      this.d.scheduler.enqueue({ id, priority: 4, source: 'system', lang: this.d.lang(), createdAt: performance.now(), parts: [{ kind: 'clip', key: 'sys.reading_done' }] });
      return;
    }
    void this.play();
  }

  private async play(): Promise<void> {
    const session = this.session;
    const i = this.i;
    const part = await this.fetch(i);
    void this.fetch(i + 1); // prefetch
    if (session !== this.session || this.state !== 'playing' || this.i !== i || this.current) return;
    if (i === 0) this.d.metrics.mark(this.id, 'first_chunk_ready');
    const u: Utterance = { id: this.id, priority: 3, source: 'reading', lang: this.d.lang(), createdAt: performance.now(), parts: [part] };
    this.current = u;
    this.d.scheduler.enqueue(u);
  }

  private fetch(i: number): Promise<AudioPart> {
    const c = this.chunks[i];
    if (!c) return Promise.resolve({ kind: 'pause', ms: 0 });
    let p = this.audio.get(i);
    if (!p) {
      p = this.synth(c.text);
      this.audio.set(i, p);
      this.audio.delete(i - 2); // keep current and next only
    }
    return p;
  }

  private async synth(text: string): Promise<AudioPart> {
    if (this.d.online() === false) return { kind: 'speak', text };
    const r = await this.d.tts(text, this.d.lang());
    if (!r.ok) return { kind: 'speak', text };
    try {
      return { kind: 'file', uri: await this.d.writeAudio(r.mp3), text };
    } catch {
      return { kind: 'speak', text };
    }
  }

  private setState(s: ReaderState) {
    if (this.state === s) return;
    this.state = s;
    for (const l of this.listeners) l();
  }
}
