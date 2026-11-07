import { blockText, orderBlocks, type OcrBlock } from './layout';

export type OcrScript = 'Latin' | 'Devanagari';
export type Recognize = (uri: string, script: OcrScript) => Promise<{ text: string; blocks: OcrBlock[] }>;

const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * On-device OCR (F7) → paragraphs in reading order. ML Kit's Latin model can't read Devanagari,
 * and its Devanagari model also covers Latin but less well, so: Devanagari first; if that found
 * no Devanagari characters, run Latin and use it when it found text. Tamil script has no ML Kit
 * model (L10.3).
 */
export async function readImage(uri: string, recognize: Recognize): Promise<{ paragraphs: string[]; script: OcrScript }> {
  let script: OcrScript = 'Devanagari';
  let r = await recognize(uri, 'Devanagari');
  if (!DEVANAGARI.test(r.text)) {
    const latin = await recognize(uri, 'Latin');
    if (latin.text.trim()) {
      r = latin;
      script = 'Latin';
    }
  }
  return { paragraphs: orderBlocks(r.blocks).map(blockText).filter(Boolean), script };
}
