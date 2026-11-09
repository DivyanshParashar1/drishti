// Node APIs without @types/node in the app's tsconfig (Jest runs on Node), as in privacy.test.ts.
declare const __dirname: string;
/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync } = require('node:fs') as { readFileSync(p: string, enc: 'utf8'): string };
const { join } = require('node:path') as { join(...p: string[]): string };

/**
 * Modules called from the camera frame worklet (useReflexCamera). A top-level function there
 * without the 'worklet' directive crashes every frame that reaches it ("Tried to synchronously
 * call a Remote Function"), which silently killed all detections (P17, clamp01). Jest runs these
 * on the JS thread, so only a source check catches it.
 */
const WORKLET_MODULES = ['decode.ts', 'preprocess.ts', 'faceWorklet.ts', 'faceAlign.ts'];
/** Top-level helpers that only the JS thread uses. */
const JS_ONLY = new Set(['supportedPixelFormat']);

test.each(WORKLET_MODULES)('every top-level function in %s is a worklet', (file) => {
  const src = readFileSync(join(__dirname, '..', file), 'utf8');
  const missing: string[] = [];
  // The body starts at the first "{" that ends a line (a return type's braces don't).
  const decl = /^(?:export )?function (\w+)[^]*?\{\n\s*(['"]worklet['"])?/gm;
  for (const m of src.matchAll(decl)) if (!m[2]) missing.push(m[1]);
  const arrow = /^(?:export )?const (\w+)\s*=\s*(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>/gm;
  for (const m of src.matchAll(arrow)) if (!JS_ONLY.has(m[1])) missing.push(`${m[1]} (arrow: make it a function with 'worklet')`);
  expect(missing).toEqual([]);
});
