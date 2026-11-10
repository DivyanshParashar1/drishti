import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LANGS, type Lang } from '../core/lang';
import { commandsFor } from '../voice/commandList';
import { LANG_CHIP } from './parts';
import { Choice, m, Section, Sheet } from './sheet';
import { colors, fonts } from './tokens';

/**
 * P17 voice-commands screen: what to say for each action, in any app language (tabs; the app's
 * language first). Every phrase here is checked against the router (commandList.test.ts).
 */
export function VoiceCommands({ lang, wakePhrase, onClose }: { lang: Lang; wakePhrase: string; onClose: () => void }) {
  const [shown, setShown] = useState<Lang>(lang);
  return (
    <Sheet title="Voice commands" onClose={onClose}>
      <View style={m.row}>
        {LANGS.map((l) => (
          <Choice key={l} label={LANG_CHIP[l]} selected={shown === l} onPress={() => setShown(l)} />
        ))}
      </View>
      <Text style={[m.hint, vc.how]}>{`Say “${wakePhrase}” and pause, or hold the screen (or the left strip) while you speak. Then:`}</Text>
      <Section title={shown === lang ? 'In the app’s language' : 'Other language (switch the app language to use it)'}>
        {commandsFor(shown).map((c) => (
          <View key={c.kind} style={vc.row} accessible accessibilityLabel={`${c.say}. ${c.does}`}>
            <Text style={vc.say}>{c.say}</Text>
            <Text style={m.hint}>{c.does}</Text>
          </View>
        ))}
      </Section>
    </Sheet>
  );
}

const vc = StyleSheet.create({
  how: { marginTop: 14, fontSize: 14, lineHeight: 20 },
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
  say: { color: colors.text, fontFamily: fonts.text, fontSize: 20, fontWeight: '600', lineHeight: 30 },
});
