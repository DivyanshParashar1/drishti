/**
 * Fixed 128-d embedding fixtures with exact, known cosine similarities: every vector is built from
 * an orthonormal basis (seeded, Gram–Schmidt), so `withSim(base, s, k)` has cosine exactly `s` to
 * `base` and is orthogonal-noise along basis direction k.
 */
const DIM = 128;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (a: number[]) => {
  const n = Math.sqrt(dot(a, a));
  return a.map((x) => x / n);
};

export const BASIS: number[][] = (() => {
  const r = rng(42);
  const out: number[][] = [];
  for (let k = 0; k < 24; k++) {
    let v = Array.from({ length: DIM }, r);
    for (const b of out) {
      const d = dot(v, b);
      v = v.map((x, i) => x - d * b[i]);
    }
    out.push(norm(v));
  }
  return out;
})();

/** Unit vector with cosine exactly `sim` to unit `base`, deviating along BASIS[k] (k ⟂ base). */
export function withSim(base: number[], sim: number, k: number): number[] {
  const o = BASIS[k];
  const s = Math.sqrt(1 - sim * sim);
  return base.map((x, i) => sim * x + s * o[i]);
}

export const cos = dot;
