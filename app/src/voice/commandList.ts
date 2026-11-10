import type { Lang } from "../core/lang";
import type { Command } from "./router";

/**
 * P17 voice-commands screen: what to say for each action, per app language.
 *
 * `say` is shown on screen in that language's script. `heard` is what Gnani's speech-to-text
 * returns for it when that differs (Hindi comes back romanised, P2); the commandList test runs
 * every `heard ?? say` through the router and checks it reaches `kind`, so the screen never
 * shows a phrase the app doesn't understand.
 */
export interface CommandExample {
  kind: Command["kind"];
  /** What it does, in English (the screen shows it under the phrase). */
  does: string;
  say: Partial<Record<Lang, string>>;
  heard?: Partial<Record<Lang, string>>;
}

export const COMMANDS: CommandExample[] = [
  {
    kind: "describe",
    does: "Describe what is in front of the camera",
    say: {
      "hi-en": "Saamne kya hai?",
      hi: "सामने क्या है?",
      en: "What's in front of me?",
      ta: "முன்னால் என்ன இருக்கிறது?",
      bn: "সামনে কী আছে?",
      te: "ముందు ఏముంది?",
      kn: "ಮುಂದೆ ಏನಿದೆ?",
      ml: "മുന്നിൽ എന്താണ്?",
      mr: "समोर काय आहे?",
      gu: "સામે શું છે?",
      pa: "ਸਾਹਮਣੇ ਕੀ ਹੈ?",
    },
    heard: { hi: "saamne kya hai" },
  },
  {
    kind: "question",
    does: "Ask anything about the scene",
    say: {
      "hi-en": "Kya ye bus 42 hai?",
      hi: "क्या ये बस बयालीस है?",
      en: "Is this bus number 42?",
      ta: "இது 42 பேருந்தா?",
      bn: "এটা কি বাস নম্বর বিয়াল্লিশ?",
      te: "ఇది నలభై రెండు నంబర్ బస్సా?",
      kn: "ಇದು ನಲವತ್ತೆರಡನೇ ನಂಬರ್ ಬಸ್ಸಾ?",
      ml: "ഇത് നാല്പത്തിരണ്ട് നമ്പർ ബസ് ആണോ?",
      mr: "ही बेचाळीस नंबरची बस आहे का?",
      gu: "આ બેતાલીસ નંબરની બસ છે?",
      pa: "ਕੀ ਇਹ ਬਿਆਲੀ ਨੰਬਰ ਬੱਸ ਹੈ?",
    },
    heard: { hi: "kya ye bas 42 hai" },
  },
  {
    kind: "read",
    does: "Read printed text aloud",
    say: {
      "hi-en": "Ye padho",
      hi: "ये पढ़ो",
      en: "Read this",
      ta: "இதைப் படி",
      bn: "এটা পড়ো",
      te: "ఇది చదువు",
      kn: "ಇದನ್ನು ಓದು",
      ml: "ഇത് വായിക്കൂ",
      mr: "हे वाच",
      gu: "આ વાંચો",
      pa: "ਇਹ ਪੜ੍ਹੋ",
    },
    heard: { hi: "ye padho" },
  },
  {
    kind: "next",
    does: "While reading: skip to the next paragraph",
    say: {
      "hi-en": "Aage",
      hi: "आगे",
      en: "Next",
      ta: "அடுத்து",
      bn: "পরেরটা",
      te: "తర్వాత",
      kn: "ಮುಂದಿನದು",
      ml: "അടുത്തത്",
      mr: "पुढे",
      gu: "પછીનું",
      pa: "ਅਗਲਾ",
    },
    heard: { hi: "aage" },
  },
  {
    kind: "stop",
    does: "Stop speaking",
    say: {
      "hi-en": "Ruko",
      hi: "रुको",
      en: "Stop",
      ta: "நிறுத்து",
      bn: "থামো",
      te: "ఆపు",
      kn: "ನಿಲ್ಲಿಸು",
      ml: "നിർത്തൂ",
      mr: "थांब",
      gu: "રોકો",
      pa: "ਰੁਕੋ",
    },
    heard: { hi: "ruko" },
  },
  {
    kind: "repeat",
    does: "Repeat the last answer",
    say: {
      "hi-en": "Phir se bolo",
      hi: "फिर से बोलो",
      en: "Say that again",
      ta: "மீண்டும் சொல்",
      bn: "আবার বলো",
      te: "మళ్ళీ చెప్పు",
      kn: "ಮತ್ತೆ ಹೇಳು",
      ml: "വീണ്ടും പറയൂ",
      mr: "पुन्हा सांग",
      gu: "ફરી બોલો",
      pa: "ਦੁਬਾਰਾ ਬੋਲੋ",
    },
    heard: { hi: "phir se bolo" },
  },
  {
    kind: "save",
    does: "Remember the person in front (asks their consent)",
    say: {
      "hi-en": "Isko Rahul ke naam se save karo",
      hi: "इसको राहुल के नाम से सेव करो",
      en: "Save this as Rahul",
      ta: "இவரை ராகுல் என்று சேமி",
      bn: "একে রাহুল নামে সেভ করো",
      te: "ఇతన్ని రాహుల్ పేరుతో సేవ్ చేయి",
      kn: "ಇವರನ್ನು ರಾಹುಲ್ ಎಂದು ಸೇವ್ ಮಾಡು",
      ml: "ഇയാളെ രാഹുൽ എന്ന പേരിൽ സേവ് ചെയ്യൂ",
      mr: "याला राहुल नावाने सेव्ह कर",
      gu: "આને રાહુલ નામે સેવ કરો",
      pa: "ਇਸਨੂੰ ਰਾਹੁਲ ਦੇ ਨਾਮ ਨਾਲ ਸੇਵ ਕਰੋ",
    },
    heard: { hi: "isko rahul ke naam se save karo" },
  },
  {
    kind: "who",
    does: "Say who is in front of you",
    say: {
      "hi-en": "Kaun hai?",
      hi: "कौन है?",
      en: "Who is here?",
      ta: "இது யார்?",
      bn: "এটা কে?",
      te: "ఇది ఎవరు?",
      kn: "ಇವರು ಯಾರು?",
      ml: "ഇത് ആരാണ്?",
      mr: "हे कोण आहे?",
      gu: "આ કોણ છે?",
      pa: "ਇਹ ਕੌਣ ਹੈ?",
    },
    heard: { hi: "kaun hai" },
  },
  {
    kind: "list",
    does: "List everyone saved",
    say: {
      "hi-en": "Kaun kaun saved hai?",
      hi: "कौन कौन सेव है?",
      en: "Who is saved?",
      ta: "சேமித்தவர்கள் பட்டியல்",
      bn: "কে কে সেভ করা আছে?",
      te: "సేవ్ చేసిన వాళ్ళ జాబితా",
      kn: "ಸೇವ್ ಆದವರ ಪಟ್ಟಿ",
      ml: "സേവ് ചെയ്തവരുടെ ലിസ്റ്റ്",
      mr: "कोण कोण सेव्ह केलेले आहेत?",
      gu: "કોણ કોણ સેવ છે?",
      pa: "ਕੌਣ ਕੌਣ ਸੇਵ ਹੈ?",
    },
    heard: { hi: "kaun kaun saved hai" },
  },
  {
    kind: "delete",
    does: "Forget a saved person",
    say: {
      "hi-en": "Rahul ko delete karo",
      hi: "राहुल को डिलीट करो",
      en: "Delete Rahul",
      ta: "ராகுல் பெயரை நீக்கு",
      bn: "রাহুল নামটা ডিলিট করো",
      te: "రాహుల్ పేరు డిలీట్ చేయి",
      kn: "ರಾಹುಲ್ ಹೆಸರು ಡಿಲೀಟ್ ಮಾಡು",
      ml: "രാഹുൽ എന്ന പേര് ഡിലീറ്റ് ചെയ്യൂ",
      mr: "राहुल नाव डिलीट कर",
      gu: "રાહુલ નામ ડિલીટ કરો",
      pa: "ਰਾਹੁਲ ਨਾਮ ਡਿਲੀਟ ਕਰੋ",
    },
    heard: { hi: "rahul ko delete karo" },
  },
  {
    kind: "quiet",
    does: 'Quiet mode: announce vehicles only (say "band karo" / "off" to end it)',
    say: {
      "hi-en": "Quiet mode chalu karo",
      hi: "शांत मोड चालू करो",
      en: "Quiet mode on",
      ta: "அமைதி முறை",
      bn: "শান্ত মোড চালু করো",
      te: "నిశ్శబ్ద మోడ్ ఆన్",
      kn: "ಶಾಂತ ಮೋಡ್ ಆನ್",
      ml: "ശാന്ത മോഡ് ഓൺ",
      mr: "शांत मोड चालू कर",
      gu: "શાંત મોડ ચાલુ કરો",
      pa: "ਸ਼ਾਂਤ ਮੋਡ ਚਾਲੂ ਕਰੋ",
    },
    heard: { hi: "quiet mode chalu karo" },
  },
  {
    kind: "language",
    does: "Change the language",
    say: {
      "hi-en": "English mein bolo",
      hi: "इंग्लिश में बोलो",
      en: "Speak in Hindi",
      ta: "ஆங்கிலத்தில் பேசு",
      bn: "ইংরেজিতে বলো",
      te: "ఇంగ్లీష్\u200cలో మాట్లాడు",
      kn: "ಇಂಗ್ಲಿಷ್\u200cನಲ್ಲಿ ಮಾತನಾಡು",
      ml: "ഇംഗ്ലീഷിൽ സംസാരിക്കൂ",
      mr: "इंग्रजीत बोल",
      gu: "અંગ્રેજીમાં બોલો",
      pa: "ਅੰਗਰੇਜ਼ੀ ਵਿੱਚ ਬੋਲੋ",
    },
    heard: { hi: "english mein bolo" },
  },
  {
    kind: "help",
    does: "Play the spoken tutorial",
    say: {
      "hi-en": "Madad",
      hi: "मदद",
      en: "Help",
      ta: "உதவி",
      bn: "সাহায্য",
      te: "సహాయం",
      kn: "ಸಹಾಯ",
      ml: "സഹായം",
      mr: "मदत",
      gu: "મદદ",
      pa: "ਮਦਦ",
    },
    heard: { hi: "madad" },
  },
  {
    kind: "demo",
    does: "Switch the demo screen off or on",
    say: {
      "hi-en": "Demo mode band karo",
      hi: "डेमो मोड बंद करो",
      en: "Demo mode off",
      ta: "டெமோ நிறுத்து",
      bn: "ডেমো মোড বন্ধ করো",
      te: "డెమో మోడ్ ఆపు",
      kn: "ಡೆಮೊ ಮೋಡ್ ನಿಲ್ಲಿಸು",
      ml: "ഡെമോ മോഡ് നിർത്തൂ",
      mr: "डेमो मोड बंद कर",
      gu: "ડેમો મોડ બંધ કરો",
      pa: "ਡੈਮੋ ਮੋਡ ਬੰਦ ਕਰੋ",
    },
    heard: { hi: "demo mode band karo" },
  },
];

/** The examples for one language, falling back to English where a language has no phrase yet. */
export function commandsFor(
  lang: Lang,
): { kind: Command["kind"]; does: string; say: string; heard: string }[] {
  return COMMANDS.map((c) => {
    const say = c.say[lang] ?? c.say.en!;
    return {
      kind: c.kind,
      does: c.does,
      say,
      heard: c.heard?.[lang] ?? (c.say[lang] ? say : c.say.en!),
    };
  });
}
