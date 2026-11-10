import type { Lang } from '../core/lang';
import type { Command } from './router';

/**
 * P17 commands in the seven added languages (bn te kn ml mr gu pa). Gnani returns them in their
 * own script (verbatim), so each language has its phrasings here, checked in the router's order:
 * demo > stop > next > help > language > save > delete > list > quiet > repeat > read > who >
 * describe. Anything else falls through to the main router (and then to a question).
 *
 * Written without a native-speaker check (LIMITATIONS L17.13); every example on the
 * voice-commands screen is tested against this.
 */
interface Lexicon {
  describe: string[];
  read: string[];
  stop: string[];
  next: string[];
  repeat: string[];
  help: string[];
  who: string[];
  /** "list" = the saved-word and one of these. */
  saved: string;
  listWords: string[];
  save: string[]; // regex sources, group 1 = name
  savePlain: string[];
  del: string[]; // regex sources, group 1 = name
  quiet: string[];
  off: string[];
  demo: string[];
  speak: string[]; // "speak (in X)": with a language name → language switch
  yes: string[];
  no: string[];
  filler: string[]; // dropped from captured names
}

const L: Partial<Record<Lang, Lexicon>> = {
  bn: {
    describe: ['সামনে কী আছে', 'সামনে কি আছে', 'কী দেখা যাচ্ছে', 'কি দেখা যাচ্ছে'],
    read: ['এটা পড়ো', 'পড়ো', 'পড়ুন', 'কী লেখা আছে', 'কি লেখা আছে'],
    stop: ['থামো', 'থামুন', 'বন্ধ করো', 'চুপ'],
    next: ['পরেরটা', 'পরের', 'এগিয়ে যাও'],
    repeat: ['আবার বলো', 'আবার বলুন', 'রিপিট'],
    help: ['সাহায্য', 'হেল্প'],
    who: ['এটা কে', 'কে আছে', 'সামনে কে'],
    saved: 'সেভ',
    listWords: ['কে কে', 'তালিকা', 'লিস্ট'],
    save: ['^(?:একে |এনাকে |ওকে |এঁকে )?(.+?) নামে (?:সেভ|মনে) (?:করো|করুন|রাখো|রাখুন)$'],
    savePlain: ['সেভ করো', 'মনে রাখো'],
    del: ['^(.+?) (?:নামটা |নাম )?(?:ডিলিট করো|ডিলিট করুন|মুছে দাও|মুছে ফেলো)$'],
    quiet: ['শান্ত মোড', 'কোয়াইট মোড'],
    off: ['বন্ধ', 'অফ'],
    demo: ['ডেমো'],
    speak: ['বলো', 'বলুন', 'কথা বলো'],
    yes: ['হ্যাঁ', 'হাঁ', 'ঠিক আছে', 'রাজি'],
    no: ['না', 'নাহ', 'রাজি না'],
    filler: ['নাম', 'আমার', 'ওর', 'এর', 'নামটা'],
  },
  te: {
    describe: ['ముందు ఏముంది', 'ఎదురుగా ఏముంది', 'ఏం కనిపిస్తోంది'],
    read: ['ఇది చదువు', 'చదువు', 'చదవండి', 'ఏం రాసి ఉంది'],
    stop: ['ఆపు', 'ఆపండి', 'ఆగు'],
    next: ['తర్వాత', 'తరువాత', 'ముందుకు'],
    repeat: ['మళ్ళీ చెప్పు', 'మళ్లీ చెప్పు', 'మళ్ళీ చెప్పండి'],
    help: ['సహాయం', 'హెల్ప్'],
    who: ['ఇది ఎవరు', 'ఎవరు ఉన్నారు', 'ముందు ఎవరు'],
    saved: 'సేవ్',
    listWords: ['జాబితా', 'లిస్ట్', 'ఎవరెవరు'],
    save: ['^(?:ఇతన్ని |ఈమెని |వీరిని |ఇతనిని )?(.+?) (?:పేరుతో|అని) (?:సేవ్ చేయి|సేవ్ చెయ్యి|సేవ్ చేయండి|గుర్తుపెట్టుకో)$'],
    savePlain: ['సేవ్ చేయి', 'సేవ్ చెయ్యి'],
    del: ['^(.+?) (?:పేరు |పేరుని )?(?:డిలీట్ చేయి|డిలీట్ చెయ్యి|డిలీట్ చేయండి|తొలగించు)$'],
    quiet: ['నిశ్శబ్ద మోడ్', 'క్వైట్ మోడ్'],
    off: ['ఆపు', 'ఆఫ్'],
    demo: ['డెమో'],
    speak: ['మాట్లాడు', 'మాట్లాడండి'],
    yes: ['అవును', 'సరే', 'ఓకే'],
    no: ['వద్దు', 'కాదు', 'లేదు'],
    filler: ['పేరు', 'నా', 'ని', 'ను'],
  },
  kn: {
    describe: ['ಮುಂದೆ ಏನಿದೆ', 'ಏನು ಕಾಣುತ್ತಿದೆ'],
    read: ['ಇದನ್ನು ಓದು', 'ಓದು', 'ಓದಿ', 'ಏನು ಬರೆದಿದೆ'],
    stop: ['ನಿಲ್ಲಿಸು', 'ನಿಲ್ಲಿಸಿ', 'ನಿಲ್ಲು'],
    next: ['ಮುಂದಿನದು', 'ಮುಂದಕ್ಕೆ'],
    repeat: ['ಮತ್ತೆ ಹೇಳು', 'ಮತ್ತೊಮ್ಮೆ ಹೇಳು', 'ಮತ್ತೆ ಹೇಳಿ'],
    help: ['ಸಹಾಯ', 'ಹೆಲ್ಪ್'],
    who: ['ಇವರು ಯಾರು', 'ಯಾರಿದ್ದಾರೆ', 'ಮುಂದೆ ಯಾರು'],
    saved: 'ಸೇವ್',
    listWords: ['ಪಟ್ಟಿ', 'ಲಿಸ್ಟ್', 'ಯಾರ್ಯಾರು'],
    save: ['^(?:ಇವರನ್ನು |ಇವನನ್ನು |ಇವಳನ್ನು )?(.+?) (?:ಎಂದು|ಹೆಸರಿನಲ್ಲಿ) (?:ಸೇವ್ ಮಾಡು|ಸೇವ್ ಮಾಡಿ|ನೆನಪಿಟ್ಟುಕೊ)$'],
    savePlain: ['ಸೇವ್ ಮಾಡು', 'ಸೇವ್ ಮಾಡಿ'],
    del: ['^(.+?) (?:ಹೆಸರು |ಅನ್ನು )?(?:ಡಿಲೀಟ್ ಮಾಡು|ಡಿಲೀಟ್ ಮಾಡಿ|ಅಳಿಸು)$'],
    quiet: ['ಶಾಂತ ಮೋಡ್', 'ಕ್ವೈಟ್ ಮೋಡ್'],
    off: ['ನಿಲ್ಲಿಸು', 'ಆಫ್'],
    demo: ['ಡೆಮೊ', 'ಡೆಮೋ'],
    speak: ['ಮಾತನಾಡು', 'ಮಾತಾಡು', 'ಮಾತನಾಡಿ'],
    yes: ['ಹೌದು', 'ಸರಿ', 'ಓಕೆ'],
    no: ['ಬೇಡ', 'ಇಲ್ಲ'],
    filler: ['ಹೆಸರು', 'ನನ್ನ', 'ಅನ್ನು'],
  },
  ml: {
    describe: ['മുന്നിൽ എന്താണ്', 'മുന്നിൽ എന്തുണ്ട്', 'എന്താണ് കാണുന്നത്'],
    read: ['ഇത് വായിക്കൂ', 'വായിക്കൂ', 'എന്താണ് എഴുതിയിരിക്കുന്നത്'],
    stop: ['നിർത്തൂ', 'നിർത്ത്', 'നിൽക്കൂ'],
    next: ['അടുത്തത്', 'അടുത്ത'],
    repeat: ['വീണ്ടും പറയൂ', 'ഒന്നുകൂടി പറയൂ'],
    help: ['സഹായം', 'ഹെൽപ്പ്'],
    who: ['ഇത് ആരാണ്', 'ആരാണ് ഉള്ളത്', 'മുന്നിൽ ആരാണ്'],
    saved: 'സേവ്',
    listWords: ['ലിസ്റ്റ്', 'ആരൊക്കെ', 'പട്ടിക'],
    save: ['^(?:ഇയാളെ |ഇവരെ |ഇവനെ |ഇവളെ )?(.+?) എന്ന (?:പേരിൽ )?(?:സേവ് ചെയ്യൂ|സേവ് ചെയ്യുക|ഓർത്തുവയ്ക്കൂ)$'],
    savePlain: ['സേവ് ചെയ്യൂ', 'സേവ് ചെയ്യുക'],
    del: ['^(.+?) (?:എന്ന പേര് )?(?:ഡിലീറ്റ് ചെയ്യൂ|ഡിലീറ്റ് ചെയ്യുക|മായ്ക്കൂ)$'],
    quiet: ['ശാന്ത മോഡ്', 'ക്വയറ്റ് മോഡ്'],
    off: ['നിർത്തൂ', 'ഓഫ്'],
    demo: ['ഡെമോ'],
    speak: ['സംസാരിക്കൂ', 'സംസാരിക്കുക'],
    yes: ['അതെ', 'ശരി', 'ഓക്കെ'],
    no: ['വേണ്ട', 'ഇല്ല'],
    filler: ['പേര്', 'എന്റെ', 'എന്ന'],
  },
  mr: {
    describe: ['समोर काय आहे', 'काय दिसत आहे', 'काय दिसतंय'],
    read: ['हे वाच', 'वाच', 'वाचा', 'काय लिहिलं आहे', 'काय लिहिले आहे'],
    stop: ['थांब', 'थांबा', 'बंद कर'],
    next: ['पुढे', 'पुढचं', 'पुढील'],
    repeat: ['पुन्हा सांग', 'परत सांग', 'पुन्हा सांगा'],
    help: ['मदत', 'हेल्प'],
    who: ['हे कोण आहे', 'कोण आहे', 'समोर कोण आहे'],
    saved: 'सेव्ह',
    listWords: ['कोण कोण', 'यादी', 'लिस्ट'],
    save: ['^(?:याला |हिला |यांना )?(.+?) (?:नावाने|या नावाने) (?:सेव्ह कर|सेव्ह करा|लक्षात ठेव|लक्षात ठेवा)$'],
    savePlain: ['सेव्ह कर', 'सेव्ह करा'],
    del: ['^(.+?) (?:नाव )?(?:डिलीट कर|डिलीट करा|काढून टाक)$'],
    quiet: ['शांत मोड', 'क्वाइट मोड'],
    off: ['बंद', 'ऑफ'],
    demo: ['डेमो'],
    speak: ['बोल', 'बोला'],
    yes: ['हो', 'होय', 'ठीक आहे', 'चालेल'],
    no: ['नाही', 'नको'],
    filler: ['नाव', 'माझं', 'माझे', 'आहे'],
  },
  gu: {
    describe: ['સામે શું છે', 'આગળ શું છે', 'શું દેખાય છે'],
    read: ['આ વાંચો', 'વાંચો', 'વાંચ', 'શું લખ્યું છે'],
    stop: ['રોકો', 'બંધ કરો', 'અટકો', 'ચૂપ'],
    next: ['પછીનું', 'આગળ'],
    repeat: ['ફરી બોલો', 'ફરીથી બોલો', 'ફરી કહો'],
    help: ['મદદ', 'હેલ્પ'],
    who: ['આ કોણ છે', 'કોણ છે', 'સામે કોણ છે'],
    saved: 'સેવ',
    listWords: ['કોણ કોણ', 'યાદી', 'લિસ્ટ'],
    save: ['^(?:આને |આમને )?(.+?) (?:નામે|ના નામે|નામથી) (?:સેવ કરો|સેવ કર|યાદ રાખો)$'],
    savePlain: ['સેવ કરો', 'યાદ રાખો'],
    del: ['^(.+?) (?:નામ )?(?:ડિલીટ કરો|ડિલીટ કર|કાઢી નાખો)$'],
    quiet: ['શાંત મોડ', 'ક્વાયટ મોડ'],
    off: ['બંધ', 'ઓફ'],
    demo: ['ડેમો'],
    speak: ['બોલો', 'બોલ'],
    yes: ['હા', 'હાં', 'બરાબર', 'ઠીક છે'],
    no: ['ના', 'નહીં'],
    filler: ['નામ', 'મારું', 'છે'],
  },
  pa: {
    describe: ['ਸਾਹਮਣੇ ਕੀ ਹੈ', 'ਅੱਗੇ ਕੀ ਹੈ', 'ਕੀ ਦਿਸ ਰਿਹਾ ਹੈ'],
    read: ['ਇਹ ਪੜ੍ਹੋ', 'ਪੜ੍ਹੋ', 'ਕੀ ਲਿਖਿਆ ਹੈ'],
    stop: ['ਰੁਕੋ', 'ਬੰਦ ਕਰੋ', 'ਚੁੱਪ'],
    next: ['ਅਗਲਾ', 'ਅੱਗੇ'],
    repeat: ['ਦੁਬਾਰਾ ਬੋਲੋ', 'ਫਿਰ ਤੋਂ ਬੋਲੋ', 'ਫੇਰ ਬੋਲੋ'],
    help: ['ਮਦਦ', 'ਹੈਲਪ'],
    who: ['ਇਹ ਕੌਣ ਹੈ', 'ਕੌਣ ਹੈ', 'ਸਾਹਮਣੇ ਕੌਣ ਹੈ'],
    saved: 'ਸੇਵ',
    listWords: ['ਕੌਣ ਕੌਣ', 'ਸੂਚੀ', 'ਲਿਸਟ'],
    save: ['^(?:ਇਸਨੂੰ |ਇਹਨੂੰ |ਇਨ੍ਹਾਂ ਨੂੰ )?(.+?) (?:ਦੇ ਨਾਮ ਨਾਲ|ਨਾਮ ਨਾਲ|ਦੇ ਨਾਂ ਨਾਲ) (?:ਸੇਵ ਕਰੋ|ਸੇਵ ਕਰ|ਯਾਦ ਰੱਖੋ)$'],
    savePlain: ['ਸੇਵ ਕਰੋ', 'ਯਾਦ ਰੱਖੋ'],
    del: ['^(.+?) (?:ਨਾਮ )?(?:ਡਿਲੀਟ ਕਰੋ|ਡਿਲੀਟ ਕਰ|ਹਟਾ ਦਿਓ)$'],
    quiet: ['ਸ਼ਾਂਤ ਮੋਡ', 'ਕਵਾਇਟ ਮੋਡ'],
    off: ['ਬੰਦ', 'ਆਫ'],
    demo: ['ਡੈਮੋ', 'ਡੇਮੋ'],
    speak: ['ਬੋਲੋ', 'ਬੋਲ'],
    yes: ['ਹਾਂ', 'ਹਾਂਜੀ', 'ਠੀਕ ਹੈ'],
    no: ['ਨਹੀਂ', 'ਨਾ'],
    filler: ['ਨਾਮ', 'ਮੇਰਾ', 'ਨਾਂ', 'ਹੈ'],
  },
};

/** Language names in every script the router might hear (substring stems, e.g. "ਅੰਗਰੇਜ਼ੀ ਵਿੱਚ"). Hinglish first: "hinglish" contains "inglish". */
const LANG_STEMS: [Lang, string[]][] = [
  ['hi-en', ['hinglish', 'হিংলিশ', 'హింగ్లిష్', 'ಹಿಂಗ್ಲಿಷ್', 'ഹിംഗ്ലീഷ', 'हिंग्लिश', 'હિંગ્લિશ', 'ਹਿੰਗਲਿਸ਼']],
  ['en', ['english', 'angrezi', 'ইংরেজি', 'ইংলিশ', 'ఇంగ్లీష్', 'ಇಂಗ್ಲಿಷ್', 'ഇംഗ്ലീഷ', 'इंग्रजी', 'इंग्लिश', 'અંગ્રેજી', 'ઇંગ્લિશ', 'ਅੰਗਰੇਜ਼ੀ', 'ਇੰਗਲਿਸ਼', 'ஆங்கில']],
  ['hi', ['hindi', 'হিন্দি', 'హిందీ', 'ಹಿಂದಿ', 'ഹിന്ദി', 'हिंदी', 'हिन्दी', 'હિન્દી', 'ਹਿੰਦੀ', 'இந்தி']],
  ['ta', ['tamil', 'তামিল', 'తమిళ', 'ತಮಿಳು', 'തമിഴ', 'तमिळ', 'तमिल', 'તમિલ', 'ਤਮਿਲ', 'தமிழ']],
  ['bn', ['bengali', 'bangla', 'বাংলা', 'బెంగాలీ', 'ಬಂಗಾಳಿ', 'ബംഗാളി', 'बंगाली', 'બંગાળી', 'ਬੰਗਾਲੀ', 'வங்காள']],
  ['te', ['telugu', 'তেলুগু', 'తెలుగు', 'ತೆಲುಗು', 'തെലുങ്ക', 'तेलुगू', 'तेलुगु', 'તેલુગુ', 'ਤੇਲਗੂ', 'தெலுங்கு']],
  ['kn', ['kannada', 'কন্নড়', 'కన్నడ', 'ಕನ್ನಡ', 'കന്നഡ', 'कन्नड', 'કન્નડ', 'ਕੰਨੜ', 'கன்னட']],
  ['ml', ['malayalam', 'মালায়ালম', 'మలయాళ', 'ಮಲಯಾಳ', 'മലയാള', 'मल्याळ', 'मलयालम', 'મલયાલમ', 'ਮਲਿਆਲਮ', 'மலையாள']],
  ['mr', ['marathi', 'মারাঠি', 'మరాఠీ', 'ಮರಾಠಿ', 'മറാഠി', 'मराठी', 'મરાઠી', 'ਮਰਾਠੀ', 'மராத்தி']],
  ['gu', ['gujarati', 'গুজরাটি', 'గుజరాతీ', 'ಗುಜರಾತಿ', 'ഗുജറാത്തി', 'गुजराती', 'ગુજરાતી', 'ਗੁਜਰਾਤੀ', 'குஜராத்தி']],
  ['pa', ['punjabi', 'panjabi', 'পাঞ্জাবি', 'పంజాబీ', 'ಪಂಜಾಬಿ', 'പഞ്ചാബി', 'पंजाबी', 'પંજાબી', 'ਪੰਜਾਬੀ', 'பஞ்சாபி']],
];

const N = (s: string) => s.normalize('NFC');
const has = (t: string, phrases: string[]) => phrases.some((p) => new RegExp(`(^|\\s)${N(p)}($|\\s)`).test(t));
const contains = (t: string, parts: string[]) => parts.some((p) => t.includes(N(p)));
const words = (t: string) => (t ? t.split(' ').length : 0);
const LEXICONS = Object.values(L) as Lexicon[];

/** Which language a transcript names ("…in Telugu"), in any script, or null. */
export function namedLanguage(t: string): Lang | null {
  for (const [lang, stems] of LANG_STEMS) if (contains(t, stems)) return lang;
  return null;
}

function cleanIndicName(raw: string, filler: string[], clean: (s: string) => string | null): string | null {
  const drop = new Set(filler.map(N));
  return clean(
    raw
      .split(' ')
      .filter((w) => w && !drop.has(w))
      .join(' '),
  );
}

/**
 * A command in one of the added languages, or null to let the main router decide. `t` is the
 * normalised transcript; `clean` is the main router's name cleaner.
 */
export function routeIndic(t: string, transcript: string, clean: (raw: string) => string | null): Command | null {
  for (const x of LEXICONS) {
    if (contains(t, x.demo)) return { kind: 'demo', on: !contains(t, x.off) };
  }
  for (const x of LEXICONS) {
    if (words(t) <= 3 && has(t, x.stop) && !contains(t, x.quiet)) return { kind: 'stop' };
  }
  for (const x of LEXICONS) if (x.next.map(N).includes(t)) return { kind: 'next' };
  for (const x of LEXICONS) if (words(t) <= 4 && has(t, x.help)) return { kind: 'help' };
  for (const x of LEXICONS) {
    if (contains(t, x.speak)) {
      const lang = namedLanguage(t);
      if (lang) return { kind: 'language', lang };
    }
  }
  for (const x of LEXICONS) {
    for (const src of x.save) {
      const m = t.match(new RegExp(N(src)));
      if (m) return { kind: 'save', name: cleanIndicName(m[1], x.filler, clean) };
    }
    if (has(t, x.savePlain)) return { kind: 'save', name: null };
  }
  for (const x of LEXICONS) {
    for (const src of x.del) {
      const m = t.match(new RegExp(N(src)));
      if (m) return { kind: 'delete', name: cleanIndicName(m[1], x.filler, clean) };
    }
  }
  for (const x of LEXICONS) if (t.includes(N(x.saved)) && contains(t, x.listWords)) return { kind: 'list' };
  for (const x of LEXICONS) if (contains(t, x.quiet)) return { kind: 'quiet', on: !contains(t, x.off) };
  for (const x of LEXICONS) if (has(t, x.repeat)) return { kind: 'repeat' };
  for (const x of LEXICONS) if (has(t, x.read)) return { kind: 'read' };
  for (const x of LEXICONS) if (has(t, x.who)) return { kind: 'who' };
  for (const x of LEXICONS) if (has(t, x.describe)) return { kind: 'describe', question: transcript.trim() };
  return null;
}

/** Consent words of the added languages, for consentAnswer. */
export const INDIC_YES = LEXICONS.flatMap((x) => x.yes);
export const INDIC_NO = LEXICONS.flatMap((x) => x.no);
/** Name filler words of the added languages, for cleanName / spokenName. */
export const INDIC_FILLER = LEXICONS.flatMap((x) => x.filler).map(N);
