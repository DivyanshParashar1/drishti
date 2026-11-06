import { Pressable, StyleSheet } from 'react-native';
import type { VoiceController } from './voiceController';

/** F5: the whole screen is one button. Press and hold to talk, release to send. */
export function TalkSurface({ voice }: { voice: VoiceController }) {
  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPressIn={() => void voice.pressIn()}
      onPressOut={() => void voice.pressOut()}
      delayLongPress={60_000} // never treat a long hold as a separate gesture
      accessibilityRole="button"
      accessibilityLabel="Hold to talk"
      accessibilityHint="Press and hold, speak, then release"
    />
  );
}
