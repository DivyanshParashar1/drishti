import { blockText, orderBlocks, type OcrBlock } from '../layout';

const b = (text: string, left: number, top: number, width = 100, height = 20): OcrBlock => ({ text, frame: { left, top, width, height } });

test('a single column is read top to bottom regardless of ML Kit order', () => {
  const out = orderBlocks([b('third', 10, 300), b('first', 10, 10), b('second', 12, 150)]);
  expect(out.map((x) => x.text)).toEqual(['first', 'second', 'third']);
});

test('blocks on the same row are read left to right (two columns, label + value)', () => {
  const out = orderBlocks([
    b('Title', 50, 5, 300, 40),
    b('Fees: Rs 500', 300, 100, 150, 20),
    b('Timing: 9 to 5', 10, 98, 150, 24),
    b('Room 12', 300, 140, 150, 20),
    b('Gate B', 10, 141, 150, 20),
  ]);
  expect(out.map((x) => x.text)).toEqual(['Title', 'Timing: 9 to 5', 'Fees: Rs 500', 'Gate B', 'Room 12']);
});

test('a slight vertical offset between neighbours still counts as one row; a clear gap does not', () => {
  const sameRow = orderBlocks([b('right', 200, 108), b('left', 10, 100)]);
  expect(sameRow.map((x) => x.text)).toEqual(['left', 'right']);
  const twoRows = orderBlocks([b('right but lower', 200, 115), b('left', 10, 100)]); // overlap 5 < 10
  expect(twoRows.map((x) => x.text)).toEqual(['left', 'right but lower']);
});

test('a tall block next to two short ones: the short ones join its row, read left to right', () => {
  const out = orderBlocks([b('B1', 200, 0, 100, 20), b('A (tall)', 10, 0, 100, 100), b('B2', 200, 30, 100, 20)]);
  expect(out.map((x) => x.text)).toEqual(['A (tall)', 'B1', 'B2']);
});

test('empty blocks are dropped; frameless blocks keep their order at the end', () => {
  const out = orderBlocks([{ text: 'no frame 1' }, b('  ', 0, 0), b('framed', 0, 50), { text: 'no frame 2' }]);
  expect(out.map((x) => x.text)).toEqual(['framed', 'no frame 1', 'no frame 2']);
});

test('blockText joins lines and undoes end-of-line hyphenation (not real hyphens)', () => {
  expect(blockText({ text: '', lines: [{ text: 'Please keep the infor-' }, { text: 'mation desk ' }, { text: 'clear.' }] })).toBe(
    'Please keep the information desk clear.',
  );
  expect(blockText({ text: 'Self-\nService counter' })).toBe('Self- Service counter');
  expect(blockText({ text: 'सूचना\nकृपया शांति बनाए रखें।' })).toBe('सूचना कृपया शांति बनाए रखें।');
});
