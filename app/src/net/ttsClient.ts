import { authHeaders, SERVER_URL } from '../core/config';
import type { Lang } from '../core/lang';

export type TtsResult = { ok: true; mp3: ArrayBuffer } | { ok: false; code: string };

export const TTS_TIMEOUT_MS = 10_000;

/**
 * POST /tts {text, lang} → MP3 bytes (Timbre via the relay). Errors come back as a short code:
 * the server's JSON `code` (rate_limited, credits_exhausted, …), `http_<status>`, `timeout` or
 * `network`. Never throws.
 */
export async function fetchTts(text: string, lang: Lang, fetchFn: typeof fetch = fetch, timeoutMs = TTS_TIMEOUT_MS): Promise<TtsResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${SERVER_URL}/tts`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      let code = `http_${res.status}`;
      try {
        const body = (await res.json()) as { code?: string };
        if (body.code) code = body.code;
      } catch {
        // non-JSON error body
      }
      return { ok: false, code };
    }
    return { ok: true, mp3: await res.arrayBuffer() };
  } catch {
    return { ok: false, code: ctl.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
