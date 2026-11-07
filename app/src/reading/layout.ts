/** The parts of an ML Kit text block used for ordering (pixels, upright image). */
export interface OcrBlock {
  text: string;
  frame?: { top: number; left: number; width: number; height: number };
  lines?: { text: string }[];
}

/**
 * F7 reading order: top to bottom, left to right. Blocks whose vertical spans overlap by at least
 * half the shorter block's height are one row (e.g. two columns side by side, a label and its
 * value) and are read left to right. Blocks without a frame keep ML Kit's order, at the end.
 */
export function orderBlocks<B extends OcrBlock>(blocks: readonly B[]): B[] {
  const framed = blocks.filter((b) => b.frame && b.text.trim());
  const rest = blocks.filter((b) => !b.frame && b.text.trim());
  framed.sort((a, b) => a.frame!.top - b.frame!.top);
  const rows: { top: number; bottom: number; items: B[] }[] = [];
  for (const b of framed) {
    const top = b.frame!.top;
    const bottom = top + b.frame!.height;
    const row = rows.at(-1);
    if (row) {
      const overlap = Math.min(bottom, row.bottom) - Math.max(top, row.top);
      const minH = Math.min(bottom - top, ...row.items.map((x) => x.frame!.height));
      if (overlap >= 0.5 * minH) {
        row.items.push(b);
        row.top = Math.min(row.top, top);
        row.bottom = Math.max(row.bottom, bottom);
        continue;
      }
    }
    rows.push({ top, bottom, items: [b] });
  }
  return [...rows.flatMap((r) => r.items.sort((a, b) => a.frame!.left - b.frame!.left)), ...rest];
}

/** A block's text as one paragraph: lines joined by spaces, end-of-line hyphenation undone. */
export function blockText(b: OcrBlock): string {
  const lines = (b.lines?.length ? b.lines.map((l) => l.text) : b.text.split('\n')).map((l) => l.trim()).filter(Boolean);
  let out = '';
  for (const l of lines) {
    if (!out) out = l;
    else if (/[a-z]-$/.test(out) && /^[a-z]/.test(l)) out = out.slice(0, -1) + l;
    else out += ' ' + l;
  }
  return out.replace(/\s+/g, ' ').trim();
}
