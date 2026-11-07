export const MAX_CHUNK = 200;

/**
 * F7 chunking for TTS: split on sentence ends (. ! ? and the Hindi danda । ॥), then pack whole
 * sentences into chunks of ≤ max characters. A sentence longer than max is split at , ; : first,
 * then at word boundaries, and a single word longer than max is cut.
 */
export function chunkText(text: string, max = MAX_CHUNK): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?।॥]+(?:[.!?।॥]+["')\]]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  const pieces = sentences.flatMap((s) => (s.length <= max ? [s] : splitLong(s, max)));
  const chunks: string[] = [];
  for (const p of pieces) {
    const last = chunks.at(-1);
    if (last !== undefined && last.length + 1 + p.length <= max) chunks[chunks.length - 1] = `${last} ${p}`;
    else chunks.push(p);
  }
  return chunks;
}

function splitLong(s: string, max: number): string[] {
  const clauses = s.split(/(?<=[,;:])\s+/);
  const out: string[] = [];
  for (const c of clauses) {
    if (c.length <= max) {
      out.push(c);
      continue;
    }
    let cur = '';
    for (const w of c.split(' ')) {
      if (w.length > max) {
        if (cur) out.push(cur);
        for (let i = 0; i < w.length; i += max) out.push(w.slice(i, i + max));
        cur = '';
      } else if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= max) cur += ` ${w}`;
      else {
        out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}
