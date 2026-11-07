import { chunkText } from '../chunk';

test('short text is one chunk; whitespace is normalised', () => {
  expect(chunkText('  Hello   world. ')).toEqual(['Hello world.']);
  expect(chunkText('   ')).toEqual([]);
});

test('whole sentences are packed into chunks of at most max characters', () => {
  const s = 'This is sentence one. This is sentence two! Is this three? Four.';
  expect(chunkText(s, 45)).toEqual(['This is sentence one. This is sentence two!', 'Is this three? Four.']);
  for (const c of chunkText(s, 45)) expect(c.length).toBeLessThanOrEqual(45);
});

test('Hindi danda ends a sentence', () => {
  const s = 'कृपया शांति बनाए रखें। मोबाइल फ़ोन बंद रखें। धन्यवाद।';
  expect(chunkText(s, 30)).toEqual(['कृपया शांति बनाए रखें।', 'मोबाइल फ़ोन बंद रखें। धन्यवाद।']);
});

test('a long sentence splits at commas, then at word boundaries', () => {
  const s = 'Visitors must carry an ID card, show it at the gate, and sign the register before entering the building premises';
  const out = chunkText(s, 40);
  expect(out).toEqual(['Visitors must carry an ID card,', 'show it at the gate,', 'and sign the register before entering', 'the building premises']);
  expect(out.every((c) => c.length <= 40)).toBe(true);
});

test('a single very long token is cut; nothing exceeds max; no text is lost', () => {
  const url = 'x'.repeat(450);
  const out = chunkText(`See ${url} now.`, 200);
  expect(out.every((c) => c.length <= 200)).toBe(true);
  expect(out.join('').replace(/ /g, '')).toBe(`See${url}now.`);
});

test('text without a final full stop keeps its tail', () => {
  expect(chunkText('Exit. Gate 3')).toEqual(['Exit. Gate 3']);
});
