import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { Script } from './captions';
import type { Caption, HudState } from './hudStore';
import { CaneIcon, Pill } from './parts';
import { colors, fonts, motion, shape, type } from './tokens';

const LINE_HEIGHT: Record<Script, number> = {
  latin: Math.round(type.caption1.fontSize * type.caption1.lineHeight.latin),
  devanagari: Math.round(type.caption1.fontSize * type.caption1.lineHeight.devanagari),
  tamil: Math.round(type.caption1.fontSize * type.caption1.lineHeight.tamil),
};

/**
 * F12 bottom dock: transcript bubble, the struck-through answer an alert cut off, and the caption
 * panel (source tag, line 1 as spoken, line 2 in English). Fades in 150 ms, out 250 ms.
 */
export function CaptionDock({ hud, onLayout }: { hud: HudState; onLayout: (e: LayoutChangeEvent) => void }) {
  const c = hud.caption;
  const shown = !!c?.visible || (!c && !!hud.bubble);
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: shown ? 1 : 0, duration: shown ? motion.captionIn : motion.captionOut, useNativeDriver: true }).start();
  }, [shown, opacity]);
  if (!c && !hud.bubble) return null;
  return (
    <Animated.View style={[cd.dock, { opacity }]} onLayout={onLayout} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      {hud.bubble && <Bubble text={hud.bubble.text} label={hud.bubble.label} />}
      {hud.cut && (
        <View style={cd.cut}>
          <Pill tone="brand">ANSWER</Pill>
          <Text style={cd.cutText} numberOfLines={1}>
            {hud.cut}
          </Text>
        </View>
      )}
      {c && <Panel c={c} flash={hud.flash} dim={hud.voice === 'listening'} thinking={hud.voice === 'thinking'} english={hud.lang !== 'en'} />}
    </Animated.View>
  );
}

function Bubble({ text, label }: { text: string; label: string | null }) {
  return (
    <View style={cd.bubble}>
      {text ? (
        <Text style={cd.bubbleText}>
          <Text style={cd.you}>You </Text>“{text}”{label && <Text style={cd.cmd}>{`  → ${label}`}</Text>}
        </Text>
      ) : (
        <Text style={cd.bubbleText}>Didn&apos;t catch that</Text>
      )}
    </View>
  );
}

function Panel({ c, flash, dim, thinking, english }: { c: Caption; flash: boolean; dim: boolean; thinking: boolean; english: boolean }) {
  const cane = c.key === 'sys.cane';
  return (
    <View style={[cd.panel, flash && cd.flash, cane && cd.canePanel]}>
      {thinking && <ThinkingBar />}
      <View style={[dim && cd.dim]}>
        <View style={[cd.tagRow, cane && cd.caneTagRow]}>
          {cane && <CaneIcon />}
          <Pill tone={c.tone === 'error' ? 'near' : c.tone}>{c.tag}</Pill>
          {c.badge === 'consent' && (
            <View style={cd.badge}>
              <Text style={cd.badgeText}>✓ CONSENT NEEDED</Text>
            </View>
          )}
          {c.meta && <Text style={[cd.meta, c.tutorial && cd.metaEnd]}>{c.meta}</Text>}
        </View>
        {c.prev && (
          <Text style={cd.prev} numberOfLines={2}>
            {c.prev}
          </Text>
        )}
        {/* The current sentence is never truncated (only the previous one is). */}
        <Text style={[cd.l1, { lineHeight: LINE_HEIGHT[c.script] }, c.tone === 'error' && cd.errorText, cane && cd.caneL1]}>{c.line1}</Text>
        {english && c.line2 && <Text style={[cd.l2, cane && cd.caneL2]}>{c.line2}</Text>}
        {c.tutorial && (
          <View style={cd.dots} accessibilityLabel={`Step ${c.tutorial.index} of ${c.tutorial.total}`}>
            {Array.from({ length: c.tutorial.total }, (_, i) => (
              <View key={i} style={[cd.dot, i < c.tutorial!.index && cd.dotOn]} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/** Indeterminate bar on top of the panel while waiting for the server (THINKING). */
function ThinkingBar() {
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [x]);
  return (
    <View style={cd.track}>
      <Animated.View style={[cd.slider, { transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-140, 380] }) }] }]} />
    </View>
  );
}

const cd = StyleSheet.create({
  dock: { position: 'absolute', left: shape.margin, right: shape.margin, bottom: shape.dockBottom, gap: 8 },
  bubble: { alignSelf: 'flex-start', maxWidth: '100%', paddingVertical: 8, paddingHorizontal: 14, borderRadius: shape.radiusPanel, backgroundColor: colors.scrim, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  bubbleText: { color: colors.text, fontFamily: fonts.text, fontSize: type.bubble.fontSize, fontWeight: '500', lineHeight: 20 },
  you: { color: colors.text2, fontWeight: '600' },
  cmd: { color: colors.brand, fontFamily: fonts.mono, fontSize: 13 },
  cut: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 18, paddingVertical: 6, paddingHorizontal: 10, borderRadius: shape.radiusPanel, backgroundColor: colors.scrim, overflow: 'hidden' },
  cutText: { flex: 1, color: colors.text2, fontFamily: fonts.text, fontSize: 15, textDecorationLine: 'line-through' },
  panel: { backgroundColor: colors.scrim, borderRadius: shape.radiusPanel, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  flash: { borderColor: colors.alertNear },
  canePanel: { borderColor: colors.text, padding: 16 },
  dim: { opacity: 0.4 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  caneTagRow: { gap: 10, marginBottom: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', height: 22, paddingHorizontal: 9, borderRadius: shape.radiusChip, borderWidth: 1.5, borderColor: colors.brand },
  badgeText: { color: colors.brand, fontFamily: fonts.text, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  meta: { color: colors.text2, fontFamily: fonts.mono, fontSize: 12 },
  metaEnd: { marginLeft: 'auto' },
  prev: { color: colors.text2, fontFamily: fonts.text, fontSize: 18, lineHeight: 27, marginBottom: 8 },
  l1: { color: colors.text, fontFamily: fonts.text, fontSize: type.caption1.fontSize, fontWeight: '600' },
  errorText: { color: '#FF6B63' },
  caneL1: { fontSize: type.titleCane.fontSize, fontWeight: '700', lineHeight: 39 },
  l2: { color: colors.text2, fontFamily: fonts.text, fontSize: type.caption2.fontSize, lineHeight: 24, marginTop: 2 },
  caneL2: { fontSize: 20, lineHeight: 27, marginTop: 6 },
  dots: { flexDirection: 'row', gap: 8, marginTop: 16 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)' },
  dotOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  track: { position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.18)' },
  slider: { position: 'absolute', top: 0, left: 0, width: 130, height: 3, backgroundColor: colors.brand },
});
