import { LANGS } from '../../core/lang';
import { COMMANDS, commandsFor } from '../commandList';
import { route } from '../router';

test.each(LANGS)('every example shown for %s reaches its command', (lang) => {
  const wrong = commandsFor(lang)
    .map((c) => ({ ...c, got: route(c.heard).kind }))
    .filter((c) => c.got !== c.kind)
    .map((c) => `${c.kind}: "${c.heard}" → ${c.got}`);
  expect(wrong).toEqual([]);
});

test('every language has a phrase for every command (no English fallbacks on screen)', () => {
  const missing = COMMANDS.flatMap((c) => LANGS.filter((l) => !c.say[l]).map((l) => `${c.kind}/${l}`));
  expect(missing).toEqual([]);
});

test('switches: quiet off and demo on are understood too', () => {
  expect(route('Quiet mode band karo')).toEqual({ kind: 'quiet', on: false });
  expect(route('Demo mode chalu karo')).toEqual({ kind: 'demo', on: true });
});
