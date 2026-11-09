import type { AudioPart, Priority, Source, Utterance } from '../../audio/scheduler';
import type { Lang } from '../../core/lang';
import { captionFor, scriptOf, tutorialStep } from '../captions';

const u = (parts: AudioPart[], source: Source = 'system', priority: Priority = 4, lang: Lang = 'hi-en'): Utterance => ({
  id: 'x',
  priority,
  source,
  lang,
  parts,
  createdAt: 0,
});
const alert = (obj: string, priority: Priority = 2, lang: Lang = 'hi-en') => u([{ kind: 'clip', key: `obj.${obj}` as never }], 'reflex', priority, lang);

test('vehicle alert (P0): just the object, English line, red, the object pulses', () => {
  const c = captionFor([alert('car', 0)], 'hi-en');
  expect(c).toMatchObject({ source: 'alert', tag: 'ALERT', tone: 'near', line1: 'Car', line2: 'Car', urgent: ['obj.car'] });
});

test('other objects are yellow and not urgent', () => {
  expect(captionFor([alert('chair')], 'hi-en')).toMatchObject({ tone: 'far', line1: 'Kursi', line2: 'Chair', urgent: [] });
  expect(captionFor([alert('bottle')], 'hi-en')).toMatchObject({ tag: 'ALERT', line1: 'Bottle' });
});

test('coalesced alerts share one caption', () => {
  const c = captionFor([alert('car', 0), alert('chair')], 'hi-en');
  expect(c.line1).toBe('Car · Kursi');
  expect(c.line2).toBe('Car · Chair');
});

test('Hindi in Devanagari, Tamil in Tamil script', () => {
  expect(captionFor([alert('chair', 2, 'hi')], 'hi')).toMatchObject({ line1: 'कुर्सी', script: 'devanagari' });
  expect(captionFor([alert('chair', 2, 'ta')], 'ta').script).toBe('tamil');
});

test('English: no second line', () => {
  expect(captionFor([alert('chair', 2, 'en')], 'en')).toMatchObject({ line1: 'Chair', line2: null });
});

test('known person: name line + direction, green', () => {
  const c = captionFor([u([{ kind: 'speak', text: 'Rahul aapke saamne hai', en: 'Rahul is ahead of you' }, { kind: 'clip', key: 'dir.left' }], 'reflex', 1)], 'hi-en');
  expect(c).toMatchObject({ source: 'name', tone: 'known', line1: 'Rahul aapke saamne hai, left mein', line2: 'Rahul is ahead of you, on the left' });
});

test('unknown person: grey NAME', () => {
  expect(captionFor([u([{ kind: 'clip', key: 'sys.unknown_person' }], 'reflex', 1)], 'hi-en')).toMatchObject({
    tag: 'NAME',
    tone: 'unknown',
    line2: 'An unknown person is ahead',
  });
});

test('answer: brand; English only when the server sent it', () => {
  expect(captionFor([u([{ kind: 'speak', text: 'Saamne gali hai.', en: 'A lane is ahead.' }], 'answer', 3)], 'hi-en')).toMatchObject({ tag: 'ANSWER', tone: 'brand', line2: 'A lane is ahead.' });
  expect(captionFor([u([{ kind: 'file', uri: 'f', text: 'Saamne gali hai.' }], 'answer', 3)], 'hi-en').line2).toBeNull();
  expect(captionFor([u([{ kind: 'clip', key: 'sys.looking' }])], 'hi-en')).toMatchObject({ tag: 'ANSWER', line1: 'Dekh rahi hoon', line2: 'Let me look' });
});

test('reading: white, no English line', () => {
  expect(captionFor([u([{ kind: 'speak', text: 'पार्किंग निषेध' }], 'reading', 3, 'hi')], 'hi')).toMatchObject({ tag: 'READING', tone: 'white', line2: null });
});

test('system lines; detector failure is red; the language switch says its own language', () => {
  expect(captionFor([u([{ kind: 'clip', key: 'sys.consent' }])], 'hi-en')).toMatchObject({ tag: 'SYSTEM', tone: 'grey', key: 'sys.consent', line2: 'Do you agree to be saved?' });
  expect(captionFor([u([{ kind: 'clip', key: 'sys.detector_failed' }], 'system', 1)], 'hi-en').tone).toBe('error');
  expect(captionFor([u([{ kind: 'clip', key: 'sys.lang_switched' }], 'system', 4, 'ta')], 'ta').line2).toBe("I'll speak in Tamil now");
});

test('scripts and tutorial steps', () => {
  expect(scriptOf('Kursi')).toBe('latin');
  expect(tutorialStep('sys.cane')).toEqual({ index: 2, total: 7 });
  expect(tutorialStep('sys.saved')).toBeNull();
});
