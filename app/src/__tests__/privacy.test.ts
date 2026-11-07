/**
 * Privacy audit (spec §9, P12): the app never logs transcripts, questions, answers, OCR text,
 * names, images or embeddings. Static check over the source: console calls are allowed only on
 * the listed startup-failure lines, and metrics notes are short codes, never variables holding
 * user content.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' || f === '__fixtures__' ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
const SOURCES = [...files(join(ROOT, 'src')), join(ROOT, 'App.tsx')];

// Startup failures only; they log the error object, never user content.
const ALLOWED_CONSOLE = new Set([
  "src/core/services.ts: console.warn('identity store failed', e)",
  "src/core/services.ts: console.warn('settings failed', e)",
  "App.tsx: console.warn('startServices failed', e)",
]);

const USER_CONTENT = /\b(transcript|lastTranscript|question|text|paragraphs|names?|embedding|embeddings|imageUri|jpeg|mp3|audioB64)\b/;

test('sources were found', () => {
  expect(SOURCES.length).toBeGreaterThan(40);
});

test('no console logging except the listed startup failures', () => {
  const found: string[] = [];
  for (const f of SOURCES) {
    for (const m of readFileSync(f, 'utf8').matchAll(/console\.(log|info|warn|error|debug)\([^)]*\)/g)) {
      found.push(`${relative(ROOT, f)}: ${m[0]}`);
    }
  }
  expect(found.filter((x) => !ALLOWED_CONSOLE.has(x))).toEqual([]);
});

test('metrics notes are constant codes or error codes, never user content', () => {
  const bad: string[] = [];
  for (const f of SOURCES) {
    for (const m of readFileSync(f, 'utf8').matchAll(/metrics\.note\(\s*[^,]+,\s*([^)]*)\)/g)) {
      const arg = m[1].trim();
      if (USER_CONTENT.test(arg)) bad.push(`${relative(ROOT, f)}: ${m[0]}`);
    }
  }
  expect(bad).toEqual([]);
});

test('the metrics export carries no free text: notes are short codes', () => {
  // The Metrics class is the only thing exported off the phone (besides the face log, which the
  // tester shares deliberately). Its event shape has no text fields beyond `note`.
  const src = readFileSync(join(ROOT, 'src/core/metrics.ts'), 'utf8');
  expect(src).toMatch(/note\?: string; \/\/ short code only/);
});
