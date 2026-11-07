import { cosine, matchFace, type KnownPerson } from '../matcher';
import { BASIS, cos, withSim } from '../__fixtures__/embeddings';

const cfg = { threshold: 0.5, ambiguityMargin: 0.08 };

// Rahul: two stored embeddings around BASIS[0]; Priya: around BASIS[1] (orthogonal people).
const rahul: KnownPerson = { id: 1, name: 'Rahul', embeddings: [withSim(BASIS[0], 0.95, 10), withSim(BASIS[0], 0.9, 11)] };
const priya: KnownPerson = { id: 2, name: 'Priya', embeddings: [withSim(BASIS[1], 0.95, 12)] };

test('fixtures have the similarities they claim', () => {
  expect(cos(withSim(BASIS[0], 0.42, 5), BASIS[0])).toBeCloseTo(0.42, 9);
  expect(cosine([3, 4], [6, 8])).toBeCloseTo(1, 9);
  expect(cosine([0, 0], [1, 0])).toBe(0);
});

test('a known person is named (best of their stored embeddings)', () => {
  const probe = withSim(BASIS[0], 0.85, 13);
  const m = matchFace(probe, [rahul, priya], cfg);
  expect(m.name).toBe('Rahul');
  expect(m.personId).toBe(1);
  expect(m.sim).toBeGreaterThan(0.75);
  expect(m.second).toBeLessThan(0.1);
});

test('a stranger (orthogonal to everyone) is unknown', () => {
  const m = matchFace(BASIS[5], [rahul, priya], cfg);
  expect(m.name).toBeNull();
  expect(Math.abs(m.sim)).toBeLessThan(0.1);
});

test('near the threshold: just below → unknown, at/above → named', () => {
  // A one-embedding person makes the similarity exact.
  const p: KnownPerson = { id: 3, name: 'Amit', embeddings: [BASIS[2]] };
  expect(matchFace(withSim(BASIS[2], 0.49, 14), [p], cfg).name).toBeNull();
  expect(matchFace(withSim(BASIS[2], 0.49, 14), [p], cfg).bestName).toBe('Amit');
  expect(matchFace(withSim(BASIS[2], 0.51, 14), [p], cfg).name).toBe('Amit');
});

test('two similar people → unknown, even when both clear the threshold', () => {
  // Twin A and B are close to each other; the probe sits between them.
  const a: KnownPerson = { id: 4, name: 'Twin A', embeddings: [BASIS[3]] };
  const b: KnownPerson = { id: 5, name: 'Twin B', embeddings: [withSim(BASIS[3], 0.9, 15)] };
  const probe = withSim(BASIS[3], 0.95, 15); // ~0.95 to A, ~0.99 to B
  const m = matchFace(probe, [a, b], cfg);
  expect(m.sim).toBeGreaterThan(0.5);
  expect(m.second).toBeGreaterThan(0.5);
  expect(m.sim - m.second).toBeLessThan(0.08);
  expect(m.name).toBeNull();
});

test('nobody stored → unknown with sim −1', () => {
  expect(matchFace(BASIS[0], [], cfg)).toEqual({ personId: null, name: null, sim: -1, second: -1, bestName: null });
});
