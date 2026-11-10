import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { CLIPS, type ClipKey } from '../audio/clips.generated';
import type { Services } from '../core/services';
import { passesQuietMode } from '../vision/alerts';
import { boxToView, type Rect } from '../vision/boxLayout';
import { ALERT_CLASSES, isAlertClass, VEHICLES } from '../vision/labels';
import type { Track } from '../vision/tracker';
import { SAVED_TICK_MS, type HudState } from './hudStore';
import { EyeSlash } from './parts';
import { colors, fonts, motion, shape } from './tokens';

type Kind = 'far' | 'near' | 'known' | 'unknown' | 'person';

interface Box {
  id: number;
  r: Rect;
  kind: Kind;
  tag: string;
  word: string | null; // the spoken word, under an object tag
  dim: boolean; // quiet mode: seen, not announced
  pulseKey: ClipKey | null;
  person: boolean;
}

const BORDER: Record<Kind, { color: string; width: number; dashed?: boolean }> = {
  far: { color: colors.alertFar, width: shape.strokeFar },
  near: { color: colors.alertNear, width: shape.strokeNear },
  known: { color: colors.known, width: shape.strokeKnown },
  unknown: { color: colors.unknown, width: shape.strokeUnknown, dashed: true },
  person: { color: colors.text, width: 2 },
};
const TAG_BG: Record<Kind, string> = { far: colors.alertFar, near: colors.alertNear, known: colors.known, unknown: colors.unknown, person: colors.text };
const TAG_H = 22;

/**
 * F12 detection boxes on the camera feed: only the classes Drishti announces, with plain tags
 * (no ids or scores): CHAIR · AHEAD · NEAR, RAHUL · LEFT, UNKNOWN, PERSON. Plus the enrolment
 * countdown ring and saved tick, and the camera-blocked overlay. Redrawn per processed frame.
 */
export function DemoBoxes({ services, hud }: { services: Services; hud: HudState }) {
  const { reflex, faces } = services;
  const [view, setView] = useState({ width: 0, height: 0 });
  const [now, setNow] = useState(0); // time of the last processed frame; redraws per frame
  useEffect(() => reflex.onUpdate(() => setNow(performance.now())), [reflex]);
  const onLayout = (e: LayoutChangeEvent) => setView(e.nativeEvent.layout);

  if (reflex.blocked.blocked) {
    return (
      <View style={[StyleSheet.absoluteFill, db.blocked]} onLayout={onLayout} pointerEvents="none">
        <EyeSlash />
      </View>
    );
  }
  const ready = reflex.frameSize.width > 0 && view.width > 0;
  const lang = hud.lang;
  const boxes: Box[] = ready
    ? reflex.visible.filter((t) => isAlertClass(t.label)).map((t) => describe(t, boxToView(t.box, reflex.frameSize, view), faces.identityOf(t.id), lang, reflex.quiet))
    : [];
  const people = boxes.filter((b) => b.person).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
  const tickOn = hud.savedAt !== null && now - hud.savedAt < SAVED_TICK_MS ? (people.find((b) => b.kind === 'known') ?? people[0]) : null;

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {boxes.map((b) => {
        const border = BORDER[b.kind];
        const inside = b.r.top < TAG_H + 8; // a box touching the top keeps its tag on screen
        return (
          <View key={b.id} style={[db.box, b.r, { borderColor: border.color, borderWidth: border.width, borderStyle: border.dashed ? 'dashed' : 'solid' }, b.dim && db.dim]}>
            {b.pulseKey && hud.pulse?.keys.includes(b.pulseKey) && <Pulse key={hud.pulse.seq} />}
            <View style={[db.tag, { backgroundColor: TAG_BG[b.kind] }, inside ? db.tagInside : db.tagAbove]}>
              <Text style={[db.tagText, b.kind === 'known' && db.tagKnown]} numberOfLines={1}>
                {b.tag}
              </Text>
              {b.word && <Text style={db.word}>{b.word}</Text>}
            </View>
            {tickOn === b && (
              <View style={db.tick}>
                <Text style={db.tickText}>✓</Text>
              </View>
            )}
          </View>
        );
      })}
      {hud.capture && ready && <Countdown capture={hud.capture} at={ringCentre(reflex.lastFaces.map((f) => boxToView(f.box, reflex.frameSize, view)), people[0]?.r)} now={now} />}
    </View>
  );
}

const DIR = { left: 'LEFT', ahead: 'AHEAD', right: 'RIGHT' } as const;

function describe(t: Track, r: Rect, who: ReturnType<Services['faces']['identityOf']>, lang: HudState['lang'], quiet: boolean): Box {
  const key = ALERT_CLASSES[t.label] as ClipKey;
  const dim = !passesQuietMode(t.label, quiet);
  const base = { id: t.id, r, dim, word: null as string | null, pulseKey: null as ClipKey | null, person: t.label === 'person' };
  if (who?.kind === 'name') return { ...base, kind: 'known', tag: `${who.name.toUpperCase()} · ${DIR[t.dir]}` };
  if (who?.kind === 'unknown') return { ...base, kind: 'unknown', tag: 'UNKNOWN' };
  if (t.label === 'person') return { ...base, kind: 'person', tag: 'PERSON' };
  const name = CLIPS.en[key].text.toUpperCase();
  const spoken = CLIPS[lang][key].text;
  // Vehicles and near objects are drawn red and pulse when spoken.
  const urgent = VEHICLES.has(t.label) || t.dist === 'near';
  return {
    ...base,
    kind: urgent ? 'near' : 'far',
    tag: `${name} · ${DIR[t.dir]} · ${t.dist === 'near' ? 'NEAR' : 'FAR'}`,
    word: lang !== 'en' && spoken.toUpperCase() !== name ? spoken : null,
    pulseKey: urgent ? key : null,
  };
}

/** The face being saved (the biggest one), else the top of the biggest person box. */
function ringCentre(faces: Rect[], person: Rect | undefined): { x: number; y: number } | null {
  const f = [...faces].sort((a, b) => b.width - a.width)[0];
  if (f) return { x: f.left + f.width / 2, y: f.top + f.height / 2 };
  return person ? { x: person.left + person.width / 2, y: person.top + Math.min(60, person.height / 4) } : null;
}

const DOTS = 24;
const RING_R = 34;

/** F4 capture countdown: dots around the face go out as the real capture time runs down. */
function Countdown({ capture, at, now }: { capture: NonNullable<HudState['capture']>; at: { x: number; y: number } | null; now: number }) {
  if (!at) return null;
  const left = Math.max(0, capture.durationMs - (now - capture.startedAt));
  const frac = left / capture.durationMs;
  return (
    <View style={[db.ring, { left: at.x - 44, top: at.y - 44 }]} accessibilityLabel={`Countdown, ${Math.ceil(left / 1000)} seconds left`}>
      {Array.from({ length: DOTS }, (_, i) => {
        const a = (i / DOTS) * 2 * Math.PI - Math.PI / 2;
        return <View key={i} style={[db.ringDot, { left: 44 + RING_R * Math.cos(a) - 3.5, top: 44 + RING_R * Math.sin(a) - 3.5 }, i / DOTS < frac && db.ringDotOn]} />;
      })}
      <View style={db.count}>
        <Text style={db.countText}>{Math.max(1, Math.ceil(left / 1000))}</Text>
      </View>
    </View>
  );
}

/** One 300 ms pulse when the vehicle or near alert for this box is spoken. */
function Pulse() {
  const [p] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(p, { toValue: 1, duration: motion.alertPulse, useNativeDriver: true }).start();
  }, [p]);
  return (
    <Animated.View
      style={[
        db.pulse,
        { opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }), transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] },
      ]}
    />
  );
}

const db = StyleSheet.create({
  blocked: { backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center' },
  box: { position: 'absolute', borderRadius: shape.radiusBox },
  dim: { opacity: 0.4 },
  tag: { position: 'absolute', left: -2, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 4 },
  tagAbove: { bottom: '100%', marginBottom: 4 },
  tagInside: { top: 4, left: 4 },
  tagText: { color: colors.tagInk, fontFamily: fonts.text, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, lineHeight: 15 },
  tagKnown: { fontSize: 15, lineHeight: 19 },
  word: { color: colors.tagInk, fontFamily: fonts.text, fontSize: 11, fontWeight: '600' },
  pulse: { position: 'absolute', left: -8, top: -8, right: -8, bottom: -8, borderWidth: 2, borderColor: 'rgba(255,59,48,0.8)', borderRadius: 10 },
  tick: { position: 'absolute', right: -2, top: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.known, alignItems: 'center', justifyContent: 'center' },
  tickText: { color: colors.tagInk, fontSize: 16, fontWeight: '800' },
  ring: { position: 'absolute', width: 88, height: 88 },
  ringDot: { position: 'absolute', width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.55)' },
  ringDotOn: { backgroundColor: colors.brand },
  count: { position: 'absolute', right: -4, top: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  countText: { color: colors.tagInk, fontFamily: fonts.mono, fontSize: 14, fontWeight: '600' },
});
