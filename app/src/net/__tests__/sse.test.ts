import { SseParser } from '../sse';

const STREAM =
  'event: sentence\ndata: {"index":0,"text":"Car left."}\n\n' +
  'event: sentence\r\ndata: {"index":1,"text":"Kursi aage."}\r\n\r\n' +
  ': keep-alive comment\n\n' +
  'event: done\ndata: {"timings":{"total_ms":900}}\n\n';

const parsed = [
  { event: 'sentence', data: '{"index":0,"text":"Car left."}' },
  { event: 'sentence', data: '{"index":1,"text":"Kursi aage."}' },
  { event: 'done', data: '{"timings":{"total_ms":900}}' },
];

test('whole stream at once', () => {
  expect(new SseParser().feed(STREAM)).toEqual(parsed);
});

test('split at every possible point gives the same events', () => {
  for (let cut = 1; cut < STREAM.length; cut++) {
    const p = new SseParser();
    expect([...p.feed(STREAM.slice(0, cut)), ...p.feed(STREAM.slice(cut))]).toEqual(parsed);
  }
});

test('one character at a time', () => {
  const p = new SseParser();
  expect([...STREAM].flatMap((c) => p.feed(c))).toEqual(parsed);
});

test('an incomplete event is held until its blank line', () => {
  const p = new SseParser();
  expect(p.feed('event: done\ndata: {}')).toEqual([]);
  expect(p.feed('\n\n')).toEqual([{ event: 'done', data: '{}' }]);
});

test('multi-line data and default event type', () => {
  expect(new SseParser().feed('data: a\ndata: b\n\n')).toEqual([{ event: 'message', data: 'a\nb' }]);
});
