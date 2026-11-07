import { IDENTITY, type IdentityConfig } from './config';

export interface KnownPerson {
  id: number;
  name: string;
  embeddings: ArrayLike<number>[]; // unit length
}

export interface Match {
  personId: number | null; // null = no confident match (unknown)
  name: string | null;
  sim: number; // best person's similarity (−1 if nobody is stored)
  second: number; // runner-up person's similarity (−1 if none)
  bestName: string | null; // best candidate even when rejected (for the DT-8.1 log)
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * F3 matching: cosine against every stored embedding of every person, best per person. A name is
 * returned only if the best person clears the threshold AND beats the runner-up by the ambiguity
 * margin: two similar-looking people resolve to unknown, never to a guess.
 */
export function matchFace(
  embedding: ArrayLike<number>,
  people: readonly KnownPerson[],
  cfg: Pick<IdentityConfig, 'threshold' | 'ambiguityMargin'> = IDENTITY,
): Match {
  let best: { p: KnownPerson; sim: number } | null = null;
  let second = -1;
  for (const p of people) {
    let s = -1;
    for (const e of p.embeddings) s = Math.max(s, cosine(embedding, e));
    if (!best || s > best.sim) {
      if (best) second = Math.max(second, best.sim);
      best = { p, sim: s };
    } else {
      second = Math.max(second, s);
    }
  }
  if (!best) return { personId: null, name: null, sim: -1, second: -1, bestName: null };
  const ok = best.sim >= cfg.threshold && best.sim - second >= cfg.ambiguityMargin;
  return {
    personId: ok ? best.p.id : null,
    name: ok ? best.p.name : null,
    sim: best.sim,
    second,
    bestName: best.p.name,
  };
}
