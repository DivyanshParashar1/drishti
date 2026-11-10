import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, shape } from './tokens';

/**
 * P17 full-screen panels (menu, voice commands, saved faces): a title, a close button and a
 * scrolling body. They cover the hold-to-talk surface, so touches here never start a talk.
 */
export function Sheet({ title, onClose, closeLabel = 'Close', children, footer }: { title: string; onClose: () => void; closeLabel?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <View style={m.root} accessibilityViewIsModal>
      <View style={m.header}>
        <Text style={m.title} accessibilityRole="header">
          {title}
        </Text>
        <Pressable onPress={onClose} style={m.close} accessibilityRole="button" accessibilityLabel={closeLabel} hitSlop={12}>
          <Text style={m.closeText}>✕</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={m.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={m.section}>
      <Text style={m.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

export function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[m.choice, selected && m.choiceOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[m.choiceText, selected && m.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Toggle({ label, detail, on, onPress }: { label: string; detail: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={m.toggle} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <View style={m.toggleText}>
        <Text style={m.label}>{label}</Text>
        <Text style={m.hint}>{detail}</Text>
      </View>
      <View style={[m.track, on && m.trackOn]}>
        <View style={[m.knob, on && m.knobOn]} />
      </View>
    </Pressable>
  );
}

export function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={m.action} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={m.choiceText}>{label}</Text>
    </Pressable>
  );
}

export const m = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.92)', paddingTop: 44 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: shape.margin, paddingBottom: 8 },
  title: { flex: 1, color: colors.brand, fontFamily: fonts.text, fontSize: 20, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.text, fontSize: 22 },
  body: { paddingHorizontal: shape.margin, paddingBottom: 48 },
  section: { marginTop: 18 },
  sectionTitle: { color: colors.text3, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, paddingHorizontal: 16, borderRadius: shape.radiusChip, borderWidth: 1, borderColor: colors.text3, justifyContent: 'center' },
  choiceOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  choiceText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  choiceTextOn: { color: colors.tagInk },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
  toggleText: { flex: 1, paddingRight: 12 },
  label: { color: colors.text, fontSize: 16, fontWeight: '600' },
  hint: { color: colors.text3, fontSize: 13, marginTop: 2 },
  track: { width: 48, height: 28, borderRadius: 14, backgroundColor: '#3a3a3c', padding: 3 },
  trackOn: { backgroundColor: colors.brand },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text },
  knobOn: { transform: [{ translateX: 20 }] },
  action: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#2c2c2e', justifyContent: 'center' },
  mono: { color: colors.text, fontFamily: fonts.mono, fontSize: 13, marginTop: 4 },
  dim: { color: colors.text3 },
});
