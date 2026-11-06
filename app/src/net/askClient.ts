import { authHeaders, SERVER_URL } from '../core/config';
import type { Lang } from '../core/lang';
import { SseParser } from './sse';

export interface AskDetection {
  cls: string;
  dir: string;
  dist: string;
}

export interface AskRequest {
  question: string;
  lang: Lang;
  detections: AskDetection[];
  names: string[];
  imageUri: string; // local JPEG, longest side ≤ 512 px, quality ~70
}

export type AskEvent =
  | { type: 'sentence'; index: number; text: string; audioB64: string | null; ttsError?: string }
  | { type: 'done'; timings: Record<string, number> }
  | { type: 'error'; code: string; timings?: Record<string, number> };

/** Streams a POST response body as text chunks. */
export interface StreamingTransport {
  post(
    url: string,
    body: FormData,
    headers: Record<string, string>,
    onChunk: (text: string) => void,
  ): Promise<{ status: number; body: string }>;
}

export function buildAskForm(req: AskRequest): FormData {
  const form = new FormData();
  form.append('question', req.question);
  form.append('lang', req.lang);
  form.append('detections', JSON.stringify(req.detections.slice(0, 30)));
  form.append('names', JSON.stringify(req.names.slice(0, 10)));
  // React Native's FormData takes a file as {uri, name, type}.
  form.append('image', { uri: req.imageUri, name: 'frame.jpg', type: 'image/jpeg' } as unknown as Blob);
  return form;
}

/** SSE event → AskEvent; null for unknown or malformed events. */
export function toAskEvent(event: string, data: string): AskEvent | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(data);
  } catch {
    return null;
  }
  if (event === 'sentence') {
    return {
      type: 'sentence',
      index: Number(d.index),
      text: String(d.text ?? ''),
      audioB64: typeof d.audio_b64 === 'string' ? d.audio_b64 : null,
      ...(typeof d.tts_error === 'string' ? { ttsError: d.tts_error } : {}),
    };
  }
  if (event === 'done') return { type: 'done', timings: (d.timings as Record<string, number>) ?? {} };
  if (event === 'error') {
    return { type: 'error', code: String(d.code ?? 'ask_error'), timings: d.timings as Record<string, number> | undefined };
  }
  return null;
}

/**
 * POST /ask and deliver events as they stream in. Always ends with exactly one `done` or `error`
 * event: HTTP errors map to the server's {"code"}, a dropped stream to `stream_ended`, and a
 * network failure to `ask_unreachable`.
 */
export async function ask(transport: StreamingTransport, req: AskRequest, onEvent: (e: AskEvent) => void): Promise<void> {
  const parser = new SseParser();
  let finished = false;
  const emit = (e: AskEvent) => {
    if (finished) return;
    if (e.type !== 'sentence') finished = true;
    onEvent(e);
  };
  const onChunk = (text: string) => {
    for (const ev of parser.feed(text)) {
      const e = toAskEvent(ev.event, ev.data);
      if (e) emit(e);
    }
  };
  try {
    const res = await transport.post(`${SERVER_URL}/ask`, buildAskForm(req), authHeaders(), onChunk);
    if (res.status !== 200) {
      let code = `http_${res.status}`;
      try {
        code = JSON.parse(res.body).code ?? code;
      } catch {
        // not JSON
      }
      emit({ type: 'error', code });
    }
  } catch {
    emit({ type: 'error', code: 'ask_unreachable' });
  }
  emit({ type: 'error', code: 'stream_ended' }); // no-op if done/error already arrived
}

/** React Native XHR: setting onprogress turns on incremental responseText updates. */
export const xhrTransport = (timeoutMs = 30_000): StreamingTransport => ({
  post(url, body, headers, onChunk) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let seen = 0;
      const flush = () => {
        const t = xhr.responseText ?? '';
        if (t.length > seen) {
          const chunk = t.slice(seen);
          seen = t.length;
          if (xhr.status === 200) onChunk(chunk);
        }
      };
      xhr.open('POST', url);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.responseType = 'text';
      xhr.timeout = timeoutMs;
      xhr.onprogress = flush;
      xhr.onload = () => {
        flush();
        resolve({ status: xhr.status, body: xhr.responseText ?? '' });
      };
      xhr.onerror = () => reject(new Error('network'));
      xhr.ontimeout = () => reject(new Error('timeout'));
      xhr.send(body);
    });
  },
});
