import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { Lang } from '../core/lang';
import type { Tone } from './captions';
import type { HudState, HudStore } from './hudStore';
import { colors, fonts, shape } from './tokens';

/** Small shared pieces of the F12 demo UI: chips, pills, labels and View-drawn icons (no SVG). */

export function useHud(store: HudStore): HudState {
  return useSyncExternalStore(store.subscribe, store.get);
}

export const TONE: Record<Tone, string> = {
  far: colors.alertFar,
  near: colors.alertNear,
  known: colors.known,
  unknown: colors.unknown,
  brand: colors.brand,
  white: colors.text,
  grey: colors.unknown,
  error: colors.alertNear,
};

export const LANG_CHIP: Record<Lang, string> = {
  'hi-en': 'HINGLISH',
  hi: 'हिंदी',
  en: 'ENGLISH',
  ta: 'தமிழ்',
  bn: 'বাংলা',
  te: 'తెలుగు',
  kn: 'ಕನ್ನಡ',
  ml: 'മലയാളം',
  mr: 'मराठी',
  gu: 'ગુજરાતી',
  pa: 'ਪੰਜਾਬੀ',
};

/** Outlined status chip (strip). */
export function Chip({ children, color = colors.text, border, fill, mono, style }: { children: ReactNode; color?: string; border?: string; fill?: string; mono?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.chip, { borderColor: border ?? 'rgba(255,255,255,0.4)' }, fill ? { backgroundColor: fill, borderColor: fill } : null, style]}>
      {typeof children === 'string' ? <Text style={[s.chipText, { color }, mono && s.mono]}>{children}</Text> : children}
    </View>
  );
}

export function ChipText({ children, color = colors.text, style }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.chipText, { color }, style]}>{children}</Text>;
}

export function Dot({ color }: { color: string }) {
  return <View style={[s.dot, { backgroundColor: color }]} />;
}

/** Filled source pill (caption panel): black text on the tone colour. */
export function Pill({ tone, children }: { tone: Tone; children: string }) {
  return (
    <View style={[s.pill, { backgroundColor: TONE[tone] }]}>
      <Text style={s.pillText}>{children}</Text>
    </View>
  );
}

/** Text rotated to read top to bottom, like the design's vertical labels. */
export function VLabel({ children, color = colors.text }: { children: string; color?: string }) {
  return (
    <View style={s.vWrap} pointerEvents="none">
      <Text style={[s.vText, { color }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

/** Touch-pad ridges on a temple strip. */
export function Ridges() {
  return (
    <View pointerEvents="none">
      {[0, 1, 2].map((i) => (
        <View key={i} style={s.ridge} />
      ))}
    </View>
  );
}

export function MicIcon({ color = colors.text2 }: { color?: string }) {
  return (
    <View style={s.micBox} accessibilityLabel="Idle">
      <View style={[s.micHead, { borderColor: color }]} />
      <View style={[s.micCup, { borderColor: color }]} />
      <View style={[s.micStem, { backgroundColor: color }]} />
    </View>
  );
}

/** A spinning arc: only shown while the app is actually waiting (THINKING). */
export function Spinner({ color = colors.text, size = 12 }: { color?: string; size?: number }) {
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color, borderRightColor: 'transparent', transform: [{ rotate }] }} />;
}

/** Eye with a slash (camera can't see). */
export function EyeSlash({ color = colors.text2 }: { color?: string }) {
  return (
    <View style={s.eye} accessibilityLabel="Camera cannot see">
      <View style={[s.eyeOuter, { borderColor: color }]} />
      <View style={[s.eyePupil, { borderColor: color }]} />
      <View style={[s.eyeSlash, { backgroundColor: color }]} />
    </View>
  );
}

/** White cane (first-run safety line). */
export function CaneIcon() {
  return (
    <View style={s.caneCircle} accessibilityLabel="White cane">
      <View style={s.caneHook} />
      <View style={s.caneShaft} />
    </View>
  );
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 24, paddingHorizontal: 9, borderRadius: shape.radiusChip, borderWidth: 1.5 },
  chipText: { fontFamily: fonts.text, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, includeFontPadding: false },
  mono: { fontFamily: fonts.mono, letterSpacing: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: { height: 22, paddingHorizontal: 9, borderRadius: shape.radiusChip, justifyContent: 'center' },
  pillText: { color: colors.tagInk, fontFamily: fonts.text, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, includeFontPadding: false },
  vWrap: { width: 260, alignItems: 'center', transform: [{ rotate: '90deg' }] },
  vText: { fontFamily: fonts.text, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase' },
  ridge: { width: 18, height: 2, marginVertical: 5, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  micBox: { width: 18, height: 18, alignItems: 'center' },
  micHead: { position: 'absolute', top: 1, width: 7, height: 11, borderRadius: 3.5, borderWidth: 2 },
  micCup: { position: 'absolute', top: 6, width: 13, height: 8, borderWidth: 2, borderTopWidth: 0, borderBottomLeftRadius: 6.5, borderBottomRightRadius: 6.5 },
  micStem: { position: 'absolute', top: 14, width: 2, height: 3 },
  eye: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  eyeOuter: { position: 'absolute', width: 68, height: 40, borderRadius: 20, borderWidth: 3 },
  eyePupil: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 3 },
  eyeSlash: { position: 'absolute', width: 84, height: 3, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  caneCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  caneHook: { position: 'absolute', top: 10, left: 16, width: 12, height: 10, borderWidth: 2.4, borderBottomWidth: 0, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderColor: colors.tagInk, borderRightColor: colors.tagInk },
  caneShaft: { position: 'absolute', top: 15, left: 16, width: 2.4, height: 19, backgroundColor: colors.tagInk },
});
