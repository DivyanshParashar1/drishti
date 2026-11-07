import type { Lang } from '../core/lang';
import type { SttResult } from './sttClient';

/** The parts of expo-speech-recognition's module used here (tests pass a fake). */
export interface Recognizer {
  start(opts: { lang: string; interimResults: boolean; requiresOnDeviceRecognition: boolean; continuous: boolean }): void;
  stop(): void;
  abort(): void;
  addListener(event: 'result', cb: (e: { isFinal: boolean; results: { transcript: string }[] }) => void): { remove(): void };
  addListener(event: 'error', cb: (e: { error: string }) => void): { remove(): void };
  addListener(event: 'end', cb: () => void): { remove(): void };
}

/** Android recognizer locale per app language. Hinglish uses the Hindi model (Devanagari output). */
export const OFFLINE_LOCALE: Record<Lang, string> = { 'hi-en': 'hi-IN', hi: 'hi-IN', en: 'en-IN', ta: 'ta-IN' };

export const OFFLINE_FINAL_TIMEOUT_MS = 3000;

/**
 * P14: on-device speech recognition while offline, for fixed commands only (questions still get
 * "Internet nahi hai"). Same shape as SttSession: the recognizer owns the mic, so push() is a
 * no-op; finish() stops listening and resolves with the last transcript (final or not) once the
 * recognizer ends, or after 3 s.
 */
export class OfflineSttSession {
  private last = '';
  private error: string | null = null;
  private ended = false;
  private waiters: (() => void)[] = [];
  private subs: { remove(): void }[] = [];

  constructor(
    private readonly rec: Recognizer,
    lang: Lang,
    private readonly timeoutMs = OFFLINE_FINAL_TIMEOUT_MS,
  ) {
    this.subs = [
      rec.addListener('result', (e) => {
        const t = e.results[0]?.transcript?.trim();
        if (t) this.last = t;
      }),
      rec.addListener('error', (e) => {
        this.error = e.error;
        this.end();
      }),
      rec.addListener('end', () => this.end()),
    ];
    try {
      rec.start({ lang: OFFLINE_LOCALE[lang], interimResults: true, requiresOnDeviceRecognition: true, continuous: true });
    } catch {
      this.error = 'start_failed';
      this.end();
    }
  }

  push(): void {}

  async finish(): Promise<SttResult> {
    if (!this.ended) {
      try {
        this.rec.stop();
      } catch {
        // already stopped
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, this.timeoutMs);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.cleanup();
    if (this.last) return { ok: true, text: this.last };
    return { ok: false, code: this.error && this.error !== 'no-speech' ? `offline_${this.error}` : 'empty' };
  }

  cancel(): void {
    try {
      this.rec.abort();
    } catch {
      // nothing to abort
    }
    this.cleanup();
  }

  private end() {
    this.ended = true;
    for (const w of this.waiters.splice(0)) w();
  }

  private cleanup() {
    for (const s of this.subs.splice(0)) s.remove();
  }
}

interface NativeModule extends Recognizer {
  isRecognitionAvailable(): boolean;
  supportsOnDeviceRecognition(): boolean;
  androidTriggerOfflineModelDownload(o: { locale: string }): Promise<{ status: string; message: string }>;
}

let native: NativeModule | null | undefined;

/** expo-speech-recognition's module, or null if it isn't in this build or can't recognise on device. */
export function onDeviceRecognizer(): NativeModule | null {
  if (native !== undefined) return native;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-speech-recognition').ExpoSpeechRecognitionModule as NativeModule;
    native = m.isRecognitionAvailable() && m.supportsOnDeviceRecognition() ? m : null;
  } catch {
    native = null;
  }
  return native;
}

/** Ask Android to download the offline model for a language (may show a system prompt). */
export async function downloadOfflineModel(lang: Lang): Promise<string> {
  const m = onDeviceRecognizer();
  if (!m) return 'unavailable';
  try {
    const r = await m.androidTriggerOfflineModelDownload({ locale: OFFLINE_LOCALE[lang] });
    return r.status;
  } catch (e) {
    return `error: ${String(e)}`;
  }
}
