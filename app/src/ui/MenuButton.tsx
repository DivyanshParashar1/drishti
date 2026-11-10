import { Pressable, StyleSheet, View } from 'react-native';
import { colors, shape } from './tokens';

export const MENU_BUTTON_SIZE = 44;

/**
 * P17: opens the demo menu (replaces the triple-tap). Top-right corner, beside the status strip,
 * well clear of the middle of the screen, which stays the hold-to-talk surface. In real-user mode
 * it stays, dimmed, so a sighted helper can still reach the menu.
 */
export function MenuButton({ top, dim, onPress }: { top: number; dim: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[mb.button, { top }, dim && mb.dim]}
      accessibilityRole="button"
      accessibilityLabel="Menu"
      accessibilityHint="Settings, voice commands, saved faces and the app tour"
      hitSlop={8}
    >
      <View style={mb.bar} />
      <View style={mb.bar} />
      <View style={mb.bar} />
    </Pressable>
  );
}

const mb = StyleSheet.create({
  button: {
    position: 'absolute',
    right: shape.margin,
    width: MENU_BUTTON_SIZE,
    height: MENU_BUTTON_SIZE,
    borderRadius: shape.radiusPanel,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dim: { opacity: 0.35 },
  bar: { width: 18, height: 2.5, borderRadius: 2, backgroundColor: colors.text },
});
