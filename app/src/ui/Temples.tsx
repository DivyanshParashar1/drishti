import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { VoiceController } from '../voice/voiceController';
import { createTapOrDouble } from './gestures';
import type { HudStore } from './hudStore';
import { micLevel } from './micLevel';
import { Ridges, VLabel } from './parts';
import { colors, fonts, shape } from './tokens';

/**
 * F12 temple strips, like the arms of glasses, on the screen edges.
 * Left: hold to talk (the same as holding anywhere). Right: tap = repeat, double-tap = stop.
 * In real-user mode they still work but aren't drawn (`hidden`).
 */
export function Temples({
  voice,
  store,
  listening,
  feedback,
  top,
  bottom,
  hidden,
  onTouch,
}: {
  voice: VoiceController;
  store: HudStore;
  listening: boolean;
  feedback: 'repeat' | 'stop' | null;
  top: number;
  bottom: number;
  hidden: boolean;
  onTouch?: () => void;
}) {
  const tap = useMemo(
    () =>
      createTapOrDouble(
        () => store.repeatLast(),
        () => {
          store.feedback('stop');
          voice.stopSpeech();
        },
      ),
    [store, voice],
  );
  const pos = { top, bottom };
  const show = hidden ? tp.hidden : null;
  return (
    <>
      <Pressable
        style={[tp.temple, tp.left, pos, listening && tp.held, show]}
        onTouchStart={onTouch}
        onPressIn={() => void voice.pressIn()}
        onPressOut={() => void voice.pressOut()}
        delayLongPress={60_000}
        accessibilityRole="button"
        accessibilityLabel={listening ? 'Listening. Double tap to send' : 'Talk to Drishti'}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && void voice.toggle()}
      >
        {listening ? (
          <>
            <VLabel color={colors.tagInk}>Listening</VLabel>
            <Waveform />
            <VLabel color={colors.tagInk}>Release to send</VLabel>
          </>
        ) : (
          <>
            <Ridges />
            <VLabel>Hold to talk</VLabel>
            <Ridges />
          </>
        )}
      </Pressable>
      <Pressable
        style={({ pressed }) => [tp.temple, tp.right, pos, pressed && tp.pressed, show]}
        onTouchStart={onTouch}
        onPress={tap}
        accessibilityRole="button"
        accessibilityLabel="Repeat. Double tap twice to stop"
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && tap()}
      >
        <Ridges />
        <VLabel>Tap repeat · 2× stop</VLabel>
        <Ridges />
      </Pressable>
      {feedback && !hidden && (
        <View style={[tp.feedback, { top: top + 24 }]} pointerEvents="none">
          <Text style={tp.feedbackText}>{feedback === 'repeat' ? '↻  REPEAT' : '■  STOP'}</Text>
        </View>
      )}
    </>
  );
}

const BARS = 9;

/** Live mic loudness, newest at the bottom; flat while there is no audio. */
function Waveform() {
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  useEffect(() => micLevel.on((v) => setLevels((l) => [...l.slice(1), v])), []);
  return (
    <View style={tp.wave} pointerEvents="none">
      {levels.map((v, i) => (
        <View key={i} style={[tp.bar, { width: 6 + Math.round(28 * v) }]} />
      ))}
    </View>
  );
}

const tp = StyleSheet.create({
  temple: { position: 'absolute', width: shape.templeWidth, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, backgroundColor: colors.scrimLight, overflow: 'visible' },
  left: { left: 0, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  right: { right: 0, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  held: { backgroundColor: colors.listen },
  pressed: { backgroundColor: 'rgba(255,255,255,0.35)' },
  hidden: { opacity: 0 },
  wave: { alignItems: 'center', gap: 6 },
  bar: { height: 3, borderRadius: 2, backgroundColor: colors.tagInk },
  feedback: { position: 'absolute', right: 58, height: 34, paddingHorizontal: 12, justifyContent: 'center', borderRadius: shape.radiusChip, backgroundColor: colors.scrim },
  feedbackText: { color: colors.text, fontFamily: fonts.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.6 },
});
