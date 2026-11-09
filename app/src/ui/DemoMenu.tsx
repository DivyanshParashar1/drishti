import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LANGS, type Lang } from '../core/lang';
import type { Services } from '../core/services';
import { VISION, type DetectorId } from '../vision/config';
import { area } from '../vision/geometry';
import type { ModelState } from '../vision/useReflexCamera';
import { LANG_CHIP } from './parts';
import { colors, fonts, shape } from './tokens';

/** Wake-word status as the menu shows it (P17). */
export interface WakeInfo {
  on: boolean;
  status: string; // "listening for “Drishti”", "no access key", an error…
  toggle(): void;
}

/**
 * P17 demo menu (triple-tap anywhere): every toggle in one place, plus a live list of what the
 * detector sees on each frame (before the alert filters), so a tester can tell "YOLO didn't see
 * it" from "YOLO saw it but it wasn't announced". For sighted testers; the blind user never
 * needs it (everything here also works by voice).
 */
export function DemoMenu({
  services,
  onClose,
  detector,
  detectorState,
  onSwitchDetector,
  front,
  onFlipCamera,
  facesOn,
  onToggleFaces,
  debug,
  onToggleDebug,
  wake,
}: {
  services: Services;
  onClose: () => void;
  detector: DetectorId;
  detectorState: ModelState['state'];
  onSwitchDetector: () => void;
  front: boolean;
  onFlipCamera: () => void;
  facesOn: boolean;
  onToggleFaces: () => void;
  debug: boolean;
  onToggleDebug: () => void;
  wake: WakeInfo;
}) {
  const { reflex } = services;
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 300);
    return () => clearInterval(t);
  }, []);

  const setLang = (l: Lang) => {
    if (l === services.lang) return;
    void services.setLanguage(l).then(() => services.say('sys.lang_switched'));
  };
  const s = reflex.stats;
  const raw = [...reflex.lastRaw].sort((a, b) => b.score - a.score).slice(0, 8);

  return (
    <View style={m.root} accessibilityViewIsModal>
      <View style={m.header}>
        <Text style={m.title}>Demo menu</Text>
        <Pressable onPress={onClose} style={m.close} accessibilityRole="button" accessibilityLabel="Close menu" hitSlop={12}>
          <Text style={m.closeText}>✕</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={m.body}>
        <Section title="Language">
          <View style={m.row}>
            {LANGS.map((l) => (
              <Choice key={l} label={LANG_CHIP[l]} selected={services.lang === l} onPress={() => setLang(l)} />
            ))}
          </View>
        </Section>

        <Section title="Camera">
          <View style={m.row}>
            <Choice label="Back" selected={!front} onPress={() => front && onFlipCamera()} />
            <Choice label="Front" selected={front} onPress={() => !front && onFlipCamera()} />
          </View>
        </Section>

        <Section title="Toggles">
          <Toggle label="Wake word" detail={wake.status} on={wake.on} onPress={wake.toggle} />
          <Toggle label="Demo UI" detail="off = plain black screen (real-user mode)" on={services.demoMode} onPress={() => services.setDemoMode(!services.demoMode)} />
          <Toggle label="Faces" detail="name saved people" on={facesOn} onPress={onToggleFaces} />
          <Toggle label="Quiet mode" detail="announce vehicles only" on={reflex.quiet} onPress={() => reflex.setQuiet(!reflex.quiet)} />
          <Toggle label="Debug overlay" detail="engineer panel: metrics, test buttons" on={debug} onPress={onToggleDebug} />
          <Toggle
            label={`Detector: ${detector === 'yolo11n' ? 'YOLO11n' : 'EfficientDet-Lite0'}`}
            detail="tap to switch"
            on={detector === 'yolo11n'}
            onPress={onSwitchDetector}
          />
        </Section>

        <Section title="Actions">
          <View style={m.row}>
            <Action label="Stop speech" onPress={() => services.scheduler.stopAll()} />
            <Action label="Reset tracker" onPress={() => reflex.tracker.reset()} />
            <Action label="Play tutorial" onPress={() => services.tutorial()} />
          </View>
        </Section>

        <Section title="What the detector sees (live)">
          <Text style={m.mono}>
            {detectorState === 'ready'
              ? `infer ${s.lastInferMs.toFixed(0)} ms · total ${s.lastTotalMs.toFixed(0)} ms · ${s.detectionsPerSec.toFixed(1)} frames/s`
              : detectorState === 'loading'
                ? 'detector loading…'
                : 'detector FAILED (see debug overlay)'}
          </Text>
          <Text style={m.hint}>{`Announced when score ≥ ${VISION.minScore} and box ≥ ${(VISION.minArea * 100).toFixed(1)}% of the frame.`}</Text>
          {raw.length === 0 && <Text style={m.mono}>nothing on this frame</Text>}
          {raw.map((d, i) => {
            const a = area(d.box);
            const ok = d.score >= VISION.minScore && a >= VISION.minArea;
            return (
              <Text key={i} style={[m.mono, !ok && m.dim]}>
                {`${ok ? '●' : '○'} ${d.label.padEnd(14)} ${d.score.toFixed(2)}  ${(a * 100).toFixed(1)}%${ok ? '' : d.score < VISION.minScore ? '  (low score)' : '  (too small)'}`}
              </Text>
            );
          })}
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={m.section}>
      <Text style={m.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
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

function Toggle({ label, detail, on, onPress }: { label: string; detail: string; on: boolean; onPress: () => void }) {
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

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={m.action} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={m.choiceText}>{label}</Text>
    </Pressable>
  );
}

const m = StyleSheet.create({
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
