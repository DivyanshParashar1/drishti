import { cleanName, normalize, route } from '../router';

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
])('save: "%s" → %s', (p, name) => {
  expect(route(p)).toEqual({ kind: 'save', name });
});

test('save without a usable name asks for it later', () => {
  expect(route('isko save karo')).toEqual({ kind: 'save', name: null });
  expect(route('save this')).toEqual({ kind: 'save', name: null });
});

test.each([
  ['Rahul ko delete karo', 'Rahul'],
  ['delete Priya', 'Priya'],
  ['rahul ko hatao', 'Rahul'],
  ['forget anil kumar', 'Anil Kumar'],
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
