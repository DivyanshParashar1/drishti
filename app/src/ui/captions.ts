import { CLIPS, type ClipKey } from '../audio/clips.generated';
import type { AudioPart, Utterance } from '../audio/scheduler';
import { TUTORIAL } from '../core/firstRun';
import type { Lang } from '../core/lang';

/**
 * F12 caption text for what is playing now: line 1 is exactly what Drishti says, in the current
 * language's script; line 2 is its English meaning (hidden when the language is English, and for
 * reading, whose OCR text has no translation). Built from the utterance parts, so it can never
 * show something that wasn't said.
 */
export type CaptionSource = 'alert' | 'name' | 'answer' | 'reading' | 'system';
/** Pill colour: far/near alert, known/unknown name, brand (answer), white (reading), grey, error (red). */
export type Tone = 'far' | 'near' | 'known' | 'unknown' | 'brand' | 'white' | 'grey' | 'error';
export type Script = 'latin' | 'devanagari' | 'tamil';

export interface CaptionText {
  source: CaptionSource;
  tag: string; // ALERT, NAME, ANSWER, READING, SYSTEM
  tone: Tone;
  line1: string;
  line2: string | null;
  script: Script;
  /** Clip key when the caption is one fixed phrase (consent badge, tutorial step, saved tick). */
  key: ClipKey | null;
  /** Object clip keys of an urgent (vehicle, P0) alert, so the matching boxes pulse. */
  urgent: ClipKey[];
}

/** "I'll speak in English now" is the English clip's text; the other packs switch to themselves. */
const LANG_SWITCHED_EN: Record<Lang, string> = {
  'hi-en': "I'll speak in Hinglish now",
  hi: "I'll speak in Hindi now",
  en: "I'll speak in English now",
  ta: "I'll speak in Tamil now",
  bn: "I'll speak in Bengali now",
  te: "I'll speak in Telugu now",
  kn: "I'll speak in Kannada now",
  ml: "I'll speak in Malayalam now",
  mr: "I'll speak in Marathi now",
  gu: "I'll speak in Gujarati now",
  pa: "I'll speak in Punjabi now",
};

export function scriptOf(text: string): Script {
  // Telugu, Kannada, Malayalam stack as tall as Tamil; Bengali, Gurmukhi, Gujarati as Devanagari.
  if (/[஀-௿ఀ-౿ಀ-೿ഀ-ൿ]/.test(text)) return 'tamil';
  if (/[ঀ-৿਀-੿઀-૿]/.test(text)) return 'devanagari';
  if (/[ऀ-ॿ]/.test(text)) return 'devanagari';
  return 'latin';
}

const clipKeys = (u: Utterance) => u.parts.flatMap((p) => (p.kind === 'clip' ? [p.key] : []));
const isAlert = (u: Utterance) => u.parts[0]?.kind === 'clip' && u.parts[0].key.startsWith('obj.');

/** One utterance's line 1 and English. English is null if any spoken piece has none. */
function lines(u: Utterance): { said: string; en: string | null } {
  const said: string[] = [];
  const en: (string | null)[] = [];
  for (const p of u.parts as AudioPart[]) {
    if (p.kind === 'clip') {
      said.push(CLIPS[u.lang][p.key].text);
      en.push(p.key === 'sys.lang_switched' ? LANG_SWITCHED_EN[u.lang] : CLIPS.en[p.key].text);
    } else if (p.kind === 'file' || p.kind === 'speak') {
      said.push(p.text);
      en.push(p.en ?? null);
    }
  }
  // An alert is just the object (P17): "Kursi" / "Chair".
  // A name is [name line] [direction]: "Rahul aapke saamne hai, left mein".
  const join = (xs: string[]) => {
    if (u.parts.length === 2 && u.parts[0].kind !== 'clip' && u.parts[1].kind === 'clip') return xs.join(', ');
    return xs.join(' ');
  };
  return { said: join(said), en: en.some((e) => e === null) ? null : join(en as string[]) };
}

/** Caption for one played scheduler entry (a coalesced alert has 2 members). */
export function captionFor(members: readonly Utterance[], lang: Lang): CaptionText {
  const first = members[0];
  const keys = members.flatMap(clipKeys);
  const parts = members.map(lines);
  const line1 = parts.map((p) => p.said).join(' · ');
  const en = parts.some((p) => p.en === null) ? null : parts.map((p) => p.en).join(' · ');
  const key = members.length === 1 && first.parts.length === 1 && first.parts[0].kind === 'clip' ? first.parts[0].key : null;
  const base = { line1, line2: lang === 'en' ? null : en, script: scriptOf(line1), key, urgent: [] as ClipKey[] };

  if (first.source === 'reading') return { ...base, source: 'reading', tag: 'READING', tone: 'white', line2: null };
  if (first.source === 'answer' || key === 'sys.looking') return { ...base, source: 'answer', tag: 'ANSWER', tone: 'brand' };
  if (keys.includes('sys.unknown_person')) return { ...base, source: 'name', tag: 'NAME', tone: 'unknown' };
  if (members.some(isAlert)) {
    const urgentMembers = members.filter((m) => isAlert(m) && m.priority === 0);
    return {
      ...base,
      source: 'alert',
      tag: 'ALERT',
      tone: urgentMembers.length ? 'near' : 'far',
      urgent: urgentMembers.flatMap((m) => clipKeys(m).filter((k) => k.startsWith('obj.'))),
    };
  }
  // [name line] [direction]: from FaceIdentifier (P1) or "kaun hai" (P4).
  if (first.parts[0]?.kind !== 'clip' && first.parts[1]?.kind === 'clip' && first.parts[1].key.startsWith('dir.')) {
    return { ...base, source: 'name', tag: 'NAME', tone: 'known' };
  }
  return { ...base, source: 'system', tag: 'SYSTEM', tone: key === 'sys.detector_failed' ? 'error' : 'grey' };
}

/** Tutorial step (F10 first run or "madad"), 1-based, or null. */
export function tutorialStep(key: ClipKey | null): { index: number; total: number } | null {
  const i = key ? TUTORIAL.indexOf(key) : -1;
  return i < 0 ? null : { index: i + 1, total: TUTORIAL.length };
}
