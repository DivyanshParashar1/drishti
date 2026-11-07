import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { VoiceController } from './voiceController';

/**
 * F5: the whole screen is one button. Press and hold to talk, release to send.
 * TalkBack (P12): its double-tap is the "activate" action, which toggles instead: double-tap to
 * start listening, double-tap again to send. Double-tap-and-hold also passes through as a hold.
 */
export function TalkSurface({ voice }: { voice: VoiceController }) {
  const [, setTick] = useState(0);
  useEffect(() => voice.onChange(() => setTick((n) => n + 1)), [voice]); // label follows the state
  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPressIn={() => void voice.pressIn()}
      onPressOut={() => void voice.pressOut()}
      delayLongPress={60_000} // never treat a long hold as a separate gesture
      accessibilityRole="button"
      accessibilityLabel={voice.state === 'listening' ? 'Listening. Double tap to send' : 'Talk to Drishti'}
      accessibilityHint="Double tap to start speaking, double tap again to send. Or press and hold, speak, then release."
      accessibilityState={{ busy: voice.state === 'busy' }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate') void voice.toggle();
      }}
    />
  );
}
