import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { LANGS, type Lang } from '../core/lang';
import type { Services } from '../core/services';
import { VISION, type DetectorId } from '../vision/config';
import { area } from '../vision/geometry';
import type { ModelState } from '../vision/useReflexCamera';
import { LANG_CHIP } from './parts';
import { Action, Choice, m, Section, Sheet, Toggle } from './sheet';

/** Wake-word status as the menu shows it (P17). */
export interface WakeInfo {
  on: boolean;
  status: string; // "listening for “Drishti”", "no access key", an error…
  toggle(): void;
}

/**
 * P17 demo menu (the menu button, top right): every toggle in one place, plus a live list of what the
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
  onOpen,
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
  /** P17: open another panel or the app tour. */
  onOpen: (what: 'commands' | 'faces' | 'tour') => void;
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
    <Sheet title="Menu" onClose={onClose} closeLabel="Close menu">
        <View style={m.row}>
          <Action label="🎙  Voice commands" onPress={() => onOpen('commands')} />
          <Action label="🙂  Saved faces" onPress={() => onOpen('faces')} />
          <Action label="🧭  App tour" onPress={() => onOpen('tour')} />
        </View>

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
            <Action label="Spoken tutorial" onPress={() => services.tutorial()} />
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
    </Sheet>
  );
}
