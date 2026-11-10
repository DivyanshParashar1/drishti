import { useEffect, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CLIPS } from '../audio/clips.generated';
import type { Services } from '../core/services';
import { scriptOf } from './captions';
import { colors, fonts, shape, type } from './tokens';
import { cardAtTop, targetRect, TOUR } from './tour';

const DIM = 'rgba(0,0,0,0.72)';

/**
 * P17 app tour: dims the screen except the part being explained, shows the line in the app's
 * language (English beneath), and says it. Back / Next / Skip; it covers the talk surface, so
 * nothing else reacts while it runs. Plays on first launch and from Menu → App tour.
 */
export function AppTour({ services, onDone }: { services: Services; onDone: () => void }) {
  const [i, setI] = useState(0);
  const { width, height } = useWindowDimensions();
  const top = Math.max(shape.stripTop, (StatusBar.currentHeight ?? 24) + 12);
  const step = TOUR[i];
  const lang = services.lang;
  const line = CLIPS[lang][step.key].text;
  const en = lang === 'en' ? null : CLIPS.en[step.key].text;

  useEffect(() => {
    services.scheduler.stopAll();
    services.say(step.key);
  }, [services, step.key]);

  const finish = () => {
    services.scheduler.stopAll();
    onDone();
  };
  const r = targetRect(step.target, { width, height }, top);
  const pad = 6;
  const hole = r && { x: r.x - pad, y: r.y - pad, w: r.width + 2 * pad, h: r.height + 2 * pad };
  const last = i === TOUR.length - 1;

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      {hole ? (
        <>
          <View style={[t.dim, { left: 0, right: 0, top: 0, height: Math.max(0, hole.y) }]} />
          <View style={[t.dim, { left: 0, right: 0, top: hole.y + hole.h, bottom: 0 }]} />
          <View style={[t.dim, { left: 0, width: Math.max(0, hole.x), top: hole.y, height: hole.h }]} />
          <View style={[t.dim, { left: hole.x + hole.w, right: 0, top: hole.y, height: hole.h }]} />
          <View style={[t.ring, { left: hole.x, top: hole.y, width: hole.w, height: hole.h }]} pointerEvents="none" />
        </>
      ) : (
        <View style={[t.dim, StyleSheet.absoluteFill]} />
      )}

      <View style={[t.card, cardAtTop(r, height) ? { top: top + 64 } : { bottom: 48 }]}>
        <Text style={t.count}>{`APP TOUR · ${i + 1}/${TOUR.length}`}</Text>
        <Text style={[t.line, scriptOf(line) !== 'latin' && t.lineTall]} accessibilityLiveRegion="polite">
          {line}
        </Text>
        {en && <Text style={t.en}>{en}</Text>}
        <View style={t.dots}>
          {TOUR.map((_, k) => (
            <View key={k} style={[t.dot, k === i && t.dotOn]} />
          ))}
        </View>
        <View style={t.buttons}>
          <Button label="Skip" onPress={finish} quiet />
          <View style={t.spacer} />
          {i > 0 && <Button label="Back" onPress={() => setI(i - 1)} quiet />}
          <Button label={last ? 'Done' : 'Next'} onPress={() => (last ? finish() : setI(i + 1))} />
        </View>
      </View>
    </View>
  );
}

function Button({ label, onPress, quiet }: { label: string; onPress: () => void; quiet?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[t.button, quiet ? t.buttonQuiet : t.buttonMain]} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <Text style={[t.buttonText, !quiet && t.buttonTextMain]}>{label}</Text>
    </Pressable>
  );
}

const t = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  ring: { position: 'absolute', borderWidth: 2, borderColor: colors.brand, borderRadius: shape.radiusPanel },
  card: { position: 'absolute', left: shape.margin, right: shape.margin, padding: 18, borderRadius: 16, backgroundColor: '#111417', borderWidth: 1, borderColor: '#2a2f33' },
  count: { color: colors.brand, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  line: { color: colors.text, fontFamily: fonts.text, fontSize: 22, fontWeight: '600', lineHeight: 30 },
  lineTall: { lineHeight: 34 },
  en: { color: colors.text2, fontFamily: fonts.text, fontSize: type.caption2.fontSize - 2, lineHeight: 22, marginTop: 8 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3a3a3c' },
  dotOn: { backgroundColor: colors.brand, width: 16 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  spacer: { flex: 1 },
  button: { minHeight: 44, paddingHorizontal: 18, borderRadius: shape.radiusChip, justifyContent: 'center' },
  buttonMain: { backgroundColor: colors.brand },
  buttonQuiet: { backgroundColor: '#2c2c2e' },
  buttonText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  buttonTextMain: { color: colors.tagInk },
});
