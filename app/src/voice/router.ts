import type { Lang } from '../core/lang';

/**
 * F5 command router: fixed keyword rules on the transcript; anything else is a question for the
 * VLM. Prisma returns Hindi/Hinglish in Latin script (transliterate, P2), English verbatim and
 * Tamil in Tamil script, so rules cover romanised Hindi, English and a few Tamil phrasings.
 *
 * Rules are checked in a fixed order so overlapping phrasings resolve predictably:
 * stop > next > help > language > save > delete > list > quiet > repeat > read > who > describe > question.
 */
export type Command =
  | { kind: 'stop' }
  | { kind: 'next' }
  | { kind: 'help' }
  | { kind: 'language'; lang: Lang }
  | { kind: 'save'; name: string | null }
  | { kind: 'delete'; name: string | null }
  | { kind: 'list' }
  | { kind: 'quiet'; on: boolean }
  | { kind: 'repeat' }
  | { kind: 'read' }
  | { kind: 'who' }
  | { kind: 'describe'; question: string }
  | { kind: 'question'; question: string }
  | { kind: 'empty' };

/** Lower-case, drop punctuation, join split forms Prisma produces ("is ko" → "isko"). */
export function normalize(transcript: string): string {
  let t = transcript
    .toLowerCase()
    .replace(/\b(what|who|where|it|that)['’]s\b/g, '$1 is')
    .replace(/[.,!?।"“”'’:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const joins: [RegExp, string][] = [
    [/\bis ko\b/g, 'isko'],
    [/\bus ko\b/g, 'usko'],
    [/\bin ko\b/g, 'inko'],
    [/\bye\b/g, 'yeh'],
    [/\bsamne\b/g, 'saamne'],
    [/\bwhats\b/g, 'what is'],
  ];
  for (const [re, to] of joins) t = t.replace(re, to);
  return t;
}

const has = (t: string, ...phrases: string[]) => phrases.some((p) => new RegExp(`(^|\\s)${p}($|\\s)`).test(t));
const words = (t: string) => (t ? t.split(' ').length : 0);

const LANG_WORDS: [RegExp, Lang][] = [
  [/\b(hinglish)\b/, 'hi-en'],
  [/\b(tamil)\b|தமிழ/, 'ta'],
  [/\b(english|angrezi|inglish)\b|ஆங்கில|இங்கிலீஷ்/, 'en'],
  [/\b(hindi)\b|இந்தி|ஹிந்தி/, 'hi'],
];

/** Clean a captured name: drop filler words, title-case. Null if nothing usable is left. */
export function cleanName(raw: string | undefined): string | null {
  if (!raw) return null;
  const filler = new Set([
    ...['naam', 'name', 'se', 'the', 'this', 'isko', 'usko', 'inko', 'as', 'ko', 'mera', 'my', 'friend', 'dost', 'hai', 'is', 'karo', 'kar', 'kijiye'],
    ...['इसको', 'इसे', 'उसको', 'नाम', 'से', 'को', 'मेरा', 'है', 'करो'],
    ...['இவரை', 'இவனை', 'இவளை', 'பெயர்', 'என்', 'இவர்'],
  ]);
  const parts = raw.split(' ').filter((w) => w && !filler.has(w));
  if (parts.length === 0 || parts.length > 3) return null;
  return parts.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export function route(transcript: string): Command {
  const t = normalize(transcript);
  if (!t) return { kind: 'empty' };

  // stop: short utterances only, so "stop sign kya hai" stays a question. "bas" only on its own:
  // Prisma also spells "bus" as "bas" ("ye bas hai").
  if (
    ['bas', 'bas karo', 'bas bas'].includes(t) ||
    (words(t) <= 3 && !/அமைதி/.test(t) && has(t, 'ruko', 'ruk jao', 'stop', 'chup', 'chup ho jao', 'band karo', 'நிறுத்து'))
  ) {
    return { kind: 'stop' };
  }

  // next (F7 "aage": skip to the next paragraph while reading). Exact short phrases only, so
  // "aage kya hai" stays a question. Outside reading, the voice flow treats it as a question.
  if (['aage', 'aage badho', 'aage padho', 'agla', 'agla padho', 'next', 'skip', 'next paragraph', 'अगला', 'आगे', 'அடுத்து'].includes(t)) {
    return { kind: 'next' };
  }

  // help: replay the tutorial (F10). Short utterances only, so "help me cross" stays a question.
  if (words(t) <= 4 && has(t, 'help', 'madad', 'tutorial', 'kaise use karein', 'kaise use karu', 'kaise chalayein', 'how to use', 'मदद', 'உதவி')) {
    return { kind: 'help' };
  }

  // language: "tamil mein bolo", "speak in english", "switch to hindi", "தமிழில் பேசு"
  if (/\b(bolo|bolna|baat karo|speak|talk|switch to|change language)\b|பேசு/.test(t)) {
    for (const [re, lang] of LANG_WORDS) if (re.test(t)) return { kind: 'language', lang };
  }

  // save: "isko rahul ke naam se save karo", "save this as rahul", "isko rahul naam do"
  let m =
    t.match(/^(?:isko |usko |inko )?(.+?) ke naam se (?:save|yaad) (?:karo|kar do|kijiye|kar lo)$/) ??
    t.match(/^save (?:this|him|her|them)? ?as (.+)$/) ??
    t.match(/^(?:isko|usko|inko) (.+?) naam do$/) ??
    t.match(/^remember (?:this|him|her) as (.+)$/);
  m ??=
    t.match(/^(?:इसको |इसे |उसको )?(.+?) के नाम से (?:सेव|याद) (?:करो|कर दो|कीजिए|कर लो)$/) ??
    t.match(/^(?:इसको|इसे|उसको) (.+?) नाम दो$/) ??
    t.match(/^(?:இவரை |இவனை |இவளை )?(.+?) என்று (?:சேமி|சேமிக்கவும்|சேமித்து வை|சேவ் செய்)$/) ??
    t.match(/^(?:இவரை |இவனை |இவளை )?(.+?) பெயரில் (?:சேமி|சேமிக்கவும்|சேவ் செய்)$/);
  if (m) return { kind: 'save', name: cleanName(m[1]) };
  if (has(t, 'save karo', 'save this', 'save him', 'save her', 'yaad rakho', 'सेव करो', 'याद रखो', 'சேமி', 'இவரை சேமி')) return { kind: 'save', name: null };

  // delete: "rahul ko delete karo", "delete rahul", "rahul ko hatao", "forget rahul"
  m =
    t.match(/^(.+?) ko (?:delete|hatao|hata do|bhool jao)(?: karo| kar do)?$/) ??
    t.match(/^(?:delete|remove|forget) (.+)$/) ??
    t.match(/^(.+?) को (?:डिलीट|हटाओ|हटा दो|भूल जाओ)(?: करो| कर दो)?$/) ??
    t.match(/^(.+?) (?:பெயரை|என்ற பெயரை) (?:நீக்கு|அழி|டெலீட் செய்)$/);
  if (m) return { kind: 'delete', name: cleanName(m[1]) };
  if (has(t, 'delete karo', 'delete', 'डिलीट करो', 'நீக்கு')) return { kind: 'delete', name: null };

  // list: "kaun kaun saved hai", "who is saved", "saved log"
  if (/\bsaved?\b/.test(t) && /\b(kaun|kis|who|list|log|people)\b/.test(t)) return { kind: 'list' };
  if (/सेव/.test(t) && /(कौन|किस|लोग)/.test(t)) return { kind: 'list' };
  if (/சேமி/.test(t) && /(யார்|பட்டியல்)/.test(t)) return { kind: 'list' };

  // quiet mode
  if (/\b(quiet|shant|shaant)\b/.test(t) || has(t, 'kam bolo', 'be quiet')) {
    const off = /\b(off|band|stop|hatao|normal)\b/.test(t);
    return { kind: 'quiet', on: !off };
  }
  if (t === 'sab batao' || t === 'normal mode') return { kind: 'quiet', on: false };
  if (/அமைதி/.test(t)) return { kind: 'quiet', on: !/(நிறுத்து|வேண்டாம்|ஆஃப்)/.test(t) };

  // repeat
  if (has(t, 'repeat', 'phir se bolo', 'dobara bolo', 'fir se bolo', 'say again', 'say that again', 'kya bola', 'phir se', 'மீண்டும் சொல்', 'திரும்ப சொல்', 'மறுபடி சொல்')) {
    return { kind: 'repeat' };
  }

  // read text (F7)
  if (has(t, 'yeh padho', 'padho', 'padh do', 'read this', 'read it', 'read', 'kya likha hai', 'what does it say', 'what is written', 'இதைப் படி', 'படி')) {
    return { kind: 'read' };
  }

  // who is here (re-announce identities, F3)
  if (has(t, 'kaun hai', 'kaun kaun hai', 'yeh kaun hai', 'who is here', 'who is this', 'who is there', 'who is in front', 'யார் இருக்கிறார்கள்', 'இது யார்')) {
    return { kind: 'who' };
  }

  // describe: routed to /ask, like a question
  if (has(t, 'saamne kya hai', 'aage kya hai', 'kya dikh raha hai', 'describe', 'what is ahead', 'what is in front', 'what do you see', 'முன்னால் என்ன இருக்கிறது', 'என்ன தெரிகிறது', 'முன்னால் என்ன')) {
    return { kind: 'describe', question: transcript.trim() };
  }

  return { kind: 'question', question: transcript.trim() };
}

/**
 * F4 "Naam bataiye" reply → a name: "Rahul", "mera naam Rahul hai", "his name is Anil Kumar",
 * "राहुल". Null if nothing usable (empty, or more than 3 words left).
 */
export function spokenName(transcript: string): string | null {
  const t = normalize(transcript)
    .replace(/^(?:(?:mera|iska|inka|unka|uska|my|his|her|their) )?(?:naam|name)(?: is)? /, '')
    .replace(/^(?:मेरा|इसका|इनका|उनका) नाम /, '')
    .replace(/^(?:என் |இவர் |இவன் |இவள் |அவர் )?பெயர் /, '')
    .replace(/ (?:hai|है)$/, '');
  return cleanName(t);
}

/** F4 consent: yes only on a clear yes; any no-word wins ("haan nahi" → no). */
export function consentAnswer(transcript: string): 'yes' | 'no' {
  const t = normalize(transcript);
  if (has(t, 'nahi', 'nahin', 'na', 'no', 'mat', 'nope', 'नहीं', 'ना', 'மாட்டேன்', 'இல்லை', 'வேண்டாம்')) return 'no';
  return has(t, 'haan', 'haa', 'ha', 'han', 'haanji', 'ji', 'ji haan', 'yes', 'yeah', 'yep', 'ok', 'okay', 'theek hai', 'thik hai', 'sure', 'हाँ', 'हां', 'जी', 'ठीक है', 'ஆம்', 'சரி')
    ? 'yes'
    : 'no';
}
