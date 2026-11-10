import { consentAnswer, route } from '../router';

test.each([
  ['bn', 'একে রাহুল নামে সেভ করো', 'রাহুল নামটা ডিলিট করো', 'রাহুল'],
  ['te', 'ఇతన్ని రాహుల్ పేరుతో సేవ్ చేయి', 'రాహుల్ పేరు డిలీట్ చేయి', 'రాహుల్'],
  ['kn', 'ಇವರನ್ನು ರಾಹುಲ್ ಎಂದು ಸೇವ್ ಮಾಡು', 'ರಾಹುಲ್ ಹೆಸರು ಡಿಲೀಟ್ ಮಾಡು', 'ರಾಹುಲ್'],
  ['ml', 'ഇയാളെ രാഹുൽ എന്ന പേരിൽ സേവ് ചെയ്യൂ', 'രാഹുൽ എന്ന പേര് ഡിലീറ്റ് ചെയ്യൂ', 'രാഹുൽ'],
  ['mr', 'याला राहुल नावाने सेव्ह कर', 'राहुल नाव डिलीट कर', 'राहुल'],
  ['gu', 'આને રાહુલ નામે સેવ કરો', 'રાહુલ નામ ડિલીટ કરો', 'રાહુલ'],
  ['pa', 'ਇਸਨੂੰ ਰਾਹੁਲ ਦੇ ਨਾਮ ਨਾਲ ਸੇਵ ਕਰੋ', 'ਰਾਹੁਲ ਨਾਮ ਡਿਲੀਟ ਕਰੋ', 'ਰਾਹੁਲ'],
])('%s: save and delete capture just the name', (_, save, del, name) => {
  expect(route(save)).toEqual({ kind: 'save', name });
  expect(route(del)).toEqual({ kind: 'delete', name });
});

test('language switch to any language, from any script', () => {
  expect(route('తెలుగులో మాట్లాడు')).toEqual({ kind: 'language', lang: 'te' });
  expect(route('ਪੰਜਾਬੀ ਵਿੱਚ ਬੋਲੋ')).toEqual({ kind: 'language', lang: 'pa' });
  expect(route('বাংলায় বলো')).toEqual({ kind: 'language', lang: 'bn' });
  expect(route('मराठीत बोल')).toEqual({ kind: 'language', lang: 'mr' });
  expect(route('Telugu mein bolo')).toEqual({ kind: 'language', lang: 'te' });
  expect(route('speak in Gujarati')).toEqual({ kind: 'language', lang: 'gu' });
  expect(route('Hinglish mein bolo')).toEqual({ kind: 'language', lang: 'hi-en' });
});

test('quiet and demo off/on', () => {
  expect(route('నిశ్శబ్ద మోడ్ ఆఫ్')).toEqual({ kind: 'quiet', on: false });
  expect(route('ಡೆಮೊ ಮೋಡ್ ಆನ್')).toEqual({ kind: 'demo', on: true });
  expect(route('ডেমো মোড বন্ধ করো')).toEqual({ kind: 'demo', on: false });
});

test.each([
  ['হ্যাঁ', 'yes'],
  ['না', 'no'],
  ['అవును', 'yes'],
  ['వద్దు', 'no'],
  ['ಹೌದು', 'yes'],
  ['ಬೇಡ', 'no'],
  ['അതെ', 'yes'],
  ['വേണ്ട', 'no'],
  ['हो', 'yes'],
  ['नको', 'no'],
  ['હા', 'yes'],
  ['ના', 'no'],
  ['ਹਾਂਜੀ', 'yes'],
  ['ਨਹੀਂ', 'no'],
] as const)('consent "%s" → %s', (said, answer) => {
  expect(consentAnswer(said)).toBe(answer);
});

test('the Hindi, Hinglish, English and Tamil rules are unchanged', () => {
  expect(route('ruko')).toEqual({ kind: 'stop' });
  expect(route('बस')).toEqual({ kind: 'stop' });
  expect(route('इसको राहुल के नाम से सेव करो')).toEqual({ kind: 'save', name: 'राहुल' });
  expect(route('stop sign kya hai')).toMatchObject({ kind: 'question' });
  expect(route('இவரை ராகுல் என்று சேமி')).toEqual({ kind: 'save', name: 'ராகுல்' });
});
