import type { ClipLang } from '../audio/clips.generated';

export type Lang = ClipLang;
export const LANGS: readonly Lang[] = ['hi-en', 'hi', 'en', 'ta'];
export const DEFAULT_LANG: Lang = 'hi-en';

/** Android TTS locale for the expo-speech fallback. Hinglish is Latin script, so en-IN reads it best. */
export const SPEECH_LOCALE: Record<Lang, string> = {
  'hi-en': 'en-IN',
  hi: 'hi-IN',
  en: 'en-IN',
  ta: 'ta-IN',
};
