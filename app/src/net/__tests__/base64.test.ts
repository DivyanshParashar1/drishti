import { base64ToBytes } from '../base64';

// Jest runs on Node; the app has no Node types.
declare const Buffer: { from(b: Uint8Array): { toString(enc: 'base64'): string } };

test.each([
  ['', []],
  ['TQ==', [77]],
  ['TWE=', [77, 97]],
  ['TWFu', [77, 97, 110]],
  ['TWE', [77, 97]], // no padding
  ['/+8=', [255, 239]],
  ['_-8', [255, 239]], // url-safe
  ['TW\nFu', [77, 97, 110]],
])('%j', (b64, bytes) => {
  expect([...base64ToBytes(b64)]).toEqual(bytes);
});

test('round-trips random bytes against Buffer', () => {
  const bytes = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37 + 11) % 256);
  const b64 = Buffer.from(bytes).toString('base64');
  expect([...base64ToBytes(b64)]).toEqual([...bytes]);
});

test('rejects garbage', () => {
  expect(() => base64ToBytes('ab$c')).toThrow('invalid base64');
});
