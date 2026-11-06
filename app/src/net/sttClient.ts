import { authHeaders, SERVER_URL } from '../core/config';
import type { Lang } from '../core/lang';

/** The parts of a WebSocket we use, so tests can pass a fake. */
export interface WebSocketLike {
  binaryType?: string;
  readyState: number;
  send(data: string | ArrayBuffer): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onclose: ((e: unknown) => void) | null;
}
export type WebSocketFactory = (url: string, headers: Record<string, string>) => WebSocketLike;

export type SttResult = { ok: true; text: string } | { ok: false; code: string };

const OPEN = 1;
export const FINAL_TIMEOUT_MS = 3000; // F5: wait at most 3 s after release for the transcript

export const sttUrl = () => `${SERVER_URL.replace(/^http/, 'ws')}/stt`;

/**
 * One push-to-talk session over /stt (server protocol: {"lang"} → PCM frames → {"type":"end"};
 * reply {"type":"final"} or {"type":"error"}). PCM pushed before the socket opens is buffered.
 */
export class SttSession {
  private ws: WebSocketLike;
  private pending: ArrayBuffer[] = [];
  private ended = false;
  private result: SttResult | null = null;
  private resolve: ((r: SttResult) => void) | null = null;

  constructor(
    factory: WebSocketFactory,
    private readonly lang: Lang,
    private readonly finalTimeoutMs = FINAL_TIMEOUT_MS,
    url = sttUrl(),
  ) {
    this.ws = factory(url, authHeaders());
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({ lang: this.lang }));
      for (const c of this.pending) this.ws.send(c);
      this.pending = [];
      if (this.ended) this.ws.send(JSON.stringify({ type: 'end' }));
    };
    this.ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'final') this.settle({ ok: true, text: String(msg.text ?? '') });
        else if (msg.type === 'error') this.settle({ ok: false, code: String(msg.code ?? 'stt_error') });
      } catch {
        // ignore malformed frames
      }
    };
    this.ws.onerror = () => this.settle({ ok: false, code: 'stt_unreachable' });
    this.ws.onclose = () => this.settle({ ok: false, code: 'stt_closed' });
  }

  push(chunk: ArrayBuffer): void {
    if (this.ended || this.result) return;
    if (this.ws.readyState === OPEN) this.ws.send(chunk);
    else this.pending.push(chunk);
  }

  /** Button released: send end and wait for the transcript (≤ finalTimeoutMs). */
  finish(): Promise<SttResult> {
    if (!this.ended) {
      this.ended = true;
      if (this.ws.readyState === OPEN) this.ws.send(JSON.stringify({ type: 'end' }));
    }
    if (this.result) return Promise.resolve(this.result);
    return new Promise((resolve) => {
      this.resolve = resolve;
      setTimeout(() => this.settle({ ok: false, code: 'stt_timeout' }), this.finalTimeoutMs);
    });
  }

  /** Abandon the session (e.g. a tap too short to be speech). */
  cancel(): void {
    this.settle({ ok: false, code: 'cancelled' });
  }

  private settle(r: SttResult) {
    if (this.result) return;
    this.result = r;
    this.resolve?.(r);
    this.resolve = null;
    try {
      this.ws.close();
    } catch {
      // already closed
    }
  }
}

/** React Native's WebSocket accepts headers as a third argument. */
export const rnWebSocketFactory: WebSocketFactory = (url, headers) =>
  new (WebSocket as unknown as new (u: string, p: null, o: { headers: Record<string, string> }) => WebSocketLike)(
    url,
    null,
    { headers },
  );
