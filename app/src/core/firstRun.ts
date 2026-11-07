import type { ClipKey } from '../audio/clips.generated';

/** F10 first run: welcome, the cane line, then the ~30 s voice tutorial (one utterance per line). */
export const TUTORIAL: readonly ClipKey[] = [
  'sys.welcome',
  'sys.cane',
  'sys.tutorial_1',
  'sys.tutorial_2',
  'sys.tutorial_3',
  'sys.tutorial_4',
  'sys.tutorial_5',
];

/** Play the tutorial once ever; "help" replays it any time. Returns whether it played. */
export async function playFirstRun(settings: { firstRunDone: boolean; setFirstRunDone(): Promise<void> }, play: () => void): Promise<boolean> {
  if (settings.firstRunDone) return false;
  play();
  await settings.setFirstRunDone().catch(() => undefined);
  return true;
}
