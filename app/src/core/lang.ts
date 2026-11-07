import type { ClipLang } from '../audio/clips.generated';

export type Lang = ClipLang;
export const LANGS: readonly Lang[] = ['hi-en', 'hi', 'en', 'ta'];
export const DEFAULT_LANG: Lang = 'hi-en';

/**
 * Android TTS locale for the expo-speech fallback (offline, before Timbre audio is saved).
 * Hinglish uses the Hindi voice: en-IN read Hinglish with an English accent (device test).
 */
export const SPEECH_LOCALE: Record<Lang, string> = {
  'hi-en': 'hi-IN',
  hi: 'hi-IN',
  en: 'en-IN',
  ta: 'ta-IN',
};
