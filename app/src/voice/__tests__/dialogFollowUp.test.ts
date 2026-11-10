import type { SchedulerHooks, Utterance } from '../../audio/scheduler';
import { startDialogFollowUp, type FollowUpDeps } from '../dialogFollowUp';

const utter = (key: string): Utterance =>
  ({ id: 'u', priority: 1, source: 'system', lang: 'hi-en', createdAt: 0, parts: [{ kind: 'clip', key }] }) as Utterance;

function setup(over: Partial<{ wakeOn: boolean; wants: boolean; state: FollowUpDeps['voice']['state']; noWake: boolean }> = {}) {
  let hooks: SchedulerHooks = {};
  const listenNow = jest.fn(async () => undefined);
  const deps: FollowUpDeps = {
    scheduler: { subscribe: (h) => ((hooks = h), () => undefined) },
    dialog: { wantsTranscript: over.wants ?? true },
    wake: over.noWake ? null : { on: over.wakeOn ?? true, listenNow },
    voice: { state: over.state ?? 'idle' },
  };
  startDialogFollowUp(deps, (f) => f());
  return { end: (key: string, reason: 'done' | 'interrupted' = 'done') => hooks.onEnd?.(utter(key), reason), listenNow };
}

test('the consent question opens a hands-free turn when it finishes', () => {
  const { end, listenNow } = setup();
  end('sys.consent');
  expect(listenNow).toHaveBeenCalledTimes(1);
});

test('"Naam bataiye" does too', () => {
  const { end, listenNow } = setup();
  end('sys.ask_name');
  expect(listenNow).toHaveBeenCalledTimes(1);
});

test('nothing opens for other lines, an interrupted question, wake word off, no dialog, or a turn in progress', () => {
  const a = setup();
  a.end('sys.saved');
  a.end('sys.consent', 'interrupted');
  expect(a.listenNow).not.toHaveBeenCalled();
  for (const s of [setup({ wakeOn: false }), setup({ wants: false }), setup({ state: 'listening' })]) {
    s.end('sys.consent');
    expect(s.listenNow).not.toHaveBeenCalled();
  }
  expect(() => setup({ noWake: true }).end('sys.consent')).not.toThrow();
});
