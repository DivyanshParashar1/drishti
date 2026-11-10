import type { ClipKey } from '../audio/clips.generated';
import type { SchedulerHooks } from '../audio/scheduler';

/** The questions the save/delete dialog asks; an answer is expected right after each. */
export const DIALOG_QUESTIONS: ReadonlySet<ClipKey> = new Set<ClipKey>(['sys.consent', 'sys.ask_name']);

/** Pause after the question ends, so the listen earcon doesn't clip its last word. */
export const FOLLOW_UP_DELAY_MS = 250;

export interface FollowUpDeps {
  scheduler: { subscribe(h: SchedulerHooks): () => void };
  dialog: { readonly wantsTranscript: boolean };
  /** The wake word, when on, opens a hands-free turn ended by loudness. */
  wake: { readonly on: boolean; listenNow(): Promise<void> } | null;
  voice: { readonly state: 'idle' | 'listening' | 'busy' };
}

/**
 * Hands-free answers for the save dialog: when "Kya aap save hone ke liye raazi hain?" or
 * "Naam bataiye" finishes playing and the wake word is on, a listening turn opens by itself, so
 * the person being saved can just say "haan" (no "Drishti" first, no button). Without the wake
 * word the answer still needs the talk button, as before.
 */
export function startDialogFollowUp(
  d: FollowUpDeps,
  schedule: (f: () => void) => void = (f) => void setTimeout(f, FOLLOW_UP_DELAY_MS),
): () => void {
  return d.scheduler.subscribe({
    onEnd: (u, reason) => {
      if (reason !== 'done') return;
      if (!u.parts.some((p) => p.kind === 'clip' && DIALOG_QUESTIONS.has(p.key))) return;
      schedule(() => {
        const wake = d.wake;
        if (!wake?.on || !d.dialog.wantsTranscript || d.voice.state !== 'idle') return;
        void wake.listenNow();
      });
    },
  });
}
