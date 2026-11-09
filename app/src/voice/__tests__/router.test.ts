import { cleanName, consentAnswer, normalize, route, spokenName } from '../router';

const kind = (t: string) => route(t).kind;

describe.each([
  ['stop', ['Ruko', 'ruk jao!', 'Stop.', 'bas', 'chup ho jao', 'நிறுத்து']],
  ['repeat', ['Phir se bolo', 'dobara bolo', 'Repeat that', 'say that again', 'kya bola?']],
  ['read', ['Ye padho', 'yeh padho', 'Read this', 'kya likha hai', 'What does it say?', 'இதைப் படி']],
  ['who', ['Kaun hai?', 'ye kaun hai', 'Who is here?', "who's in front", 'இது யார்']],
  ['list', ['Kaun kaun saved hai', 'who is saved', 'saved log batao', 'list saved people']],
  ['describe', ['Saamne kya hai?', 'samne kya hai', 'aage kya hai', "What's ahead?", 'describe', 'முன்னால் என்ன இருக்கிறது']],
])('%s', (k, phrasings) => {
  test.each(phrasings as string[])('"%s"', (p) => expect(kind(p)).toBe(k));
});

test.each([
  ['Tamil mein bolo', 'ta'],
  ['English mein bolo', 'en'],
  ['Hindi mein bolo', 'hi'],
  ['hinglish mein baat karo', 'hi-en'],
  ['speak in English', 'en'],
  ['switch to Tamil', 'ta'],
  ['தமிழில் பேசு', 'ta'],
  ['இங்கிலீஷ் மே போலோ பேசு', 'en'],
])('language: "%s" → %s', (p, lang) => {
  expect(route(p)).toEqual({ kind: 'language', lang });
});

test.each([
  ['Is ko Rahul ke naam se save karo', 'Rahul'],
  ['isko rahul ke naam se save karo', 'Rahul'],
  ['Save this as Priya', 'Priya'],
  ['save as anil kumar', 'Anil Kumar'],
  ['isko Meena naam do', 'Meena'],
  ['remember him as Ravi', 'Ravi'],
  ['isko rahul kumar sharma ke naam se save karo', 'Rahul Kumar Sharma'],
  ['इसको राहुल के नाम से सेव करो', 'राहुल'],
  ['इसे सुनीता देवी के नाम से याद करो', 'सुनीता देवी'],
  ['इसको मीना नाम दो', 'मीना'],
])('save: "%s" → %s', (p, name) => {
  expect(route(p)).toEqual({ kind: 'save', name });
});

test('save without a usable name asks for it later', () => {
  expect(route('isko save karo')).toEqual({ kind: 'save', name: null });
  expect(route('save this')).toEqual({ kind: 'save', name: null });
  expect(route('सेव करो')).toEqual({ kind: 'save', name: null });
  expect(route('isko a b c d ke naam se save karo')).toEqual({ kind: 'save', name: null }); // > 3 words
});

test.each([
  ['Rahul ko delete karo', 'Rahul'],
  ['delete Priya', 'Priya'],
  ['rahul ko hatao', 'Rahul'],
  ['forget anil kumar', 'Anil Kumar'],
  ['राहुल को डिलीट करो', 'राहुल'],
  ['सुनीता देवी को हटाओ', 'सुनीता देवी'],
])('delete: "%s" → %s', (p, name) => {
  expect(route(p)).toEqual({ kind: 'delete', name });
});

test.each([
  ['Quiet mode on', true],
  ['quiet mode chalu karo', true],
  ['shant mode', true],
  ['kam bolo', true],
  ['Quiet mode off', false],
  ['quiet mode band karo', false],
  ['sab batao', false],
])('quiet: "%s" → %s', (p, on) => {
  expect(route(p)).toEqual({ kind: 'quiet', on });
});

test.each([
  'Kya ye bus 42 hai?',
  'ye bas hai', // Prisma's "bus": not stop
  'Shirt ka rang kya hai?',
  'Is the stop sign red?', // has "stop" but is a question
  'What colour is the car?',
  'Tell me everything about this room',
  'Is the road wet?',
])('unmatched → question: "%s"', (p) => {
  expect(route(p)).toEqual({ kind: 'question', question: p });
});

test('describe keeps the original transcript as the question', () => {
  expect(route(' Saamne kya hai? ')).toEqual({ kind: 'describe', question: 'Saamne kya hai?' });
});

test('empty or punctuation-only transcripts', () => {
  expect(kind('')).toBe('empty');
  expect(kind(' ?. ')).toBe('empty');
});

test('normalize joins Prisma split forms', () => {
  expect(normalize('Is ko, Rahul!')).toBe('isko rahul');
  expect(normalize("What's ahead?")).toBe('what is ahead');
});

test('cleanName drops filler and rejects long captures', () => {
  expect(cleanName('mera dost rahul')).toBe('Rahul');
  expect(cleanName('the')).toBeNull();
  expect(cleanName('a b c d')).toBeNull();
});

test('delete without a name asks for it later; Hindi-script list', () => {
  expect(route('delete karo')).toEqual({ kind: 'delete', name: null });
  expect(route('कौन कौन सेव है')).toEqual({ kind: 'list' });
});

test.each([
  ['Rahul', 'Rahul'],
  ['mera naam Rahul hai', 'Rahul'],
  ['iska naam anil kumar hai', 'Anil Kumar'],
  ['His name is Ravi.', 'Ravi'],
  ['राहुल', 'राहुल'],
  ['मेरा नाम सुनीता देवी है', 'सुनीता देवी'],
  ['', null],
  ['one two three four', null],
])('spokenName("%s") → %s', (t, name) => {
  expect(spokenName(t)).toBe(name);
});

test.each([
  ['Haan', 'yes'],
  ['haan ji', 'yes'],
  ['Yes, sure.', 'yes'],
  ['theek hai', 'yes'],
  ['हाँ', 'yes'],
  ['ஆம்', 'yes'],
  ['nahi', 'no'],
  ['haan nahi', 'no'],
  ['no thanks', 'no'],
  ['नहीं', 'no'],
  ['kya?', 'no'],
  ['', 'no'],
])('consentAnswer("%s") → %s', (t, a) => {
  expect(consentAnswer(t)).toBe(a);
});

test.each(['Aage', 'aage badho', 'next', 'Skip.', 'agla padho', 'आगे', 'அடுத்து'])('next: "%s"', (p) => {
  expect(route(p)).toEqual({ kind: 'next' });
});

test('"aage" inside a longer question is not next', () => {
  expect(kind('aage kya hai')).toBe('describe');
  expect(kind('aage seedhi hai kya')).toBe('question');
});

describe('Tamil (Prisma returns Tamil script)', () => {
  test.each([
    ['இவரை ராகுல் என்று சேமி', { kind: 'save', name: 'ராகுல்' }],
    ['ப்ரியா பெயரில் சேமிக்கவும்', { kind: 'save', name: 'ப்ரியா' }],
    ['சேமி', { kind: 'save', name: null }],
    ['ராகுல் பெயரை நீக்கு', { kind: 'delete', name: 'ராகுல்' }],
    ['நீக்கு', { kind: 'delete', name: null }],
    ['யார் யார் சேமிக்கப்பட்டுள்ளனர்', { kind: 'list' }],
    ['அமைதி முறை', { kind: 'quiet', on: true }],
    ['அமைதி முறை வேண்டாம்', { kind: 'quiet', on: false }],
    ['அமைதி முறை நிறுத்து', { kind: 'quiet', on: false }],
    ['நிறுத்து', { kind: 'stop' }],
    ['மீண்டும் சொல்', { kind: 'repeat' }],
    ['இதைப் படி', { kind: 'read' }],
    ['இது யார்', { kind: 'who' }],
    ['தமிழில் பேசு', { kind: 'language', lang: 'ta' }],
    ['ஆங்கிலத்தில் பேசு', { kind: 'language', lang: 'en' }],
    ['அடுத்து', { kind: 'next' }],
  ])('"%s"', (p, cmd) => {
    expect(route(p)).toEqual(cmd);
  });
  test('describe keeps the question text', () => {
    expect(route('என்ன தெரிகிறது')).toEqual({ kind: 'describe', question: 'என்ன தெரிகிறது' });
  });
  test('Tamil name replies and consent', () => {
    expect(spokenName('என் பெயர் ராகுல்')).toBe('ராகுல்');
    expect(spokenName('இவர் பெயர் ப்ரியா')).toBe('ப்ரியா');
    expect(consentAnswer('ஆம்')).toBe('yes');
    expect(consentAnswer('வேண்டாம்')).toBe('no');
  });
});

test.each(['Help', 'madad', 'tutorial', 'kaise use karein', 'मदद', 'உதவி', 'help please'])('help: "%s"', (p) => {
  expect(route(p)).toEqual({ kind: 'help' });
});

test('"help me cross the road safely please" is a question', () => {
  expect(kind('help me cross the road safely please')).toBe('question');
});

describe('Devanagari commands (on-device Hindi recognition offline, P14)', () => {
  test.each([
    ['रुको', 'stop'],
    ['बस', 'stop'],
    ['ये पढ़ो', 'read'],
    ['ये पढ़ो'.normalize('NFD'), 'read'], // ढ + nukta
    ['क्या लिखा है', 'read'],
    ['क्वाइट मोड चालू', 'quiet'],
    ['फिर से बोलो', 'repeat'],
    ['कौन है', 'who'],
    ['सामने क्या है', 'describe'],
    ['आगे', 'next'],
    ['मदद', 'help'],
  ])('"%s" → %s', (p, k) => {
    expect(kind(p)).toBe(k);
  });
  test('quiet off', () => {
    expect(route('क्वाइट मोड बंद')).toEqual({ kind: 'quiet', on: false });
  });
});

test('F12 demo mode on/off, before stop', () => {
  expect(route('demo mode band karo')).toEqual({ kind: 'demo', on: false });
  expect(route('demo band karo')).toEqual({ kind: 'demo', on: false });
  expect(route('Demo mode off')).toEqual({ kind: 'demo', on: false });
  expect(route('demo mode chalu karo')).toEqual({ kind: 'demo', on: true });
  expect(route('demo mode on')).toEqual({ kind: 'demo', on: true });
  expect(route('डेमो मोड बंद करो')).toEqual({ kind: 'demo', on: false });
  expect(route('band karo')).toEqual({ kind: 'stop' });
});
