import { useEffect, useState } from 'react';
import { Animated, Image, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { Services } from '../core/services';
import type { ModelState } from '../vision/useReflexCamera';
import type { VoiceController } from '../voice/voiceController';
import { CaptionDock } from './CaptionDock';
import type { HudStore } from './hudStore';
import { LatencyCard, ToastView } from './LatencyCard';
import { MENU_BUTTON_SIZE, MenuButton } from './MenuButton';
import { useHud } from './parts';
import { StatusStrip } from './StatusStrip';
import { Temples } from './Temples';
import { MARK_MONO } from './brand';
import { colors, fonts, motion, shape } from './tokens';

const TOAST_H = 34;

/**
 * F12 demo UI over the camera feed (default), or real-user mode: a plain black screen with a dim
 * wordmark. Only the temple strips take touches; everything else lets holds through to the
 * whole-screen talk button underneath.
 */
export function Hud({
  services,
  voice,
  store,
  demo,
  detector,
  facesOn,
  onMenu,
}: {
  services: Services;
  voice: VoiceController;
  store: HudStore;
  demo: boolean;
  detector: ModelState['state'];
  facesOn: boolean;
  /** P17: the menu button (replaces the triple-tap). */
  onMenu: () => void;
}) {
  const hud = useHud(store);
  const [stripH, setStripH] = useState<number>(shape.stripMinHeight);
  const [dockH, setDockH] = useState(0);
  const top = Math.max(shape.stripTop, (StatusBar.currentHeight ?? 24) + 12);
  const stripBottom = top + stripH;
  const belowTop = hud.toast ? stripBottom + 8 + TOAST_H + 14 : stripBottom + 16;
  const templeBottom = Math.max(176, shape.dockBottom + (hud.caption || hud.bubble ? dockH : 0) + 16);
  const listening = hud.voice === 'listening';

  if (!demo) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={hd.black} pointerEvents="none">
          <Image source={MARK_MONO} style={hd.dimLogo} />
          <Text style={hd.dimMark}>Drishti</Text>
        </View>
        <Temples voice={voice} store={store} listening={listening} feedback={null} top={top + 60} bottom={176} hidden />
        {hud.toast && <ToastView toast={hud.toast} top={stripBottom + 8} />}
        <MenuButton top={top} dim onPress={onMenu} />
      </View>
    );
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {listening && <EdgeGlow />}
      {hud.caption?.key === 'sys.cane' && <View style={hd.shade} pointerEvents="none" />}
      <StatusStrip hud={hud} services={services} detector={detector} facesOn={facesOn} top={top} right={shape.margin + MENU_BUTTON_SIZE + 8} onLayout={(e) => setStripH(e.nativeEvent.layout.height)} />
      {hud.toast && <ToastView toast={hud.toast} top={stripBottom + 8} />}
      <LatencyCard latency={hud.latency} top={belowTop} />
      <Temples voice={voice} store={store} listening={listening} feedback={hud.feedback} top={belowTop} bottom={templeBottom} hidden={false} />
      <MenuButton top={top} dim={false} onPress={onMenu} />
      <CaptionDock hud={hud} onLayout={(e) => setDockH(e.nativeEvent.layout.height)} />
    </View>
  );
}

/** Listening: a soft brand glow on the screen edge, breathing at 1.2 s (no blur). */
function EdgeGlow() {
  const [o] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const half = motion.listenGlowLoop / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 0.55, duration: half, useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: half, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: o }]} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, hd.glow1]} />
      <View style={[StyleSheet.absoluteFill, hd.glow2]} />
      <View style={[StyleSheet.absoluteFill, hd.glow3]} />
    </Animated.View>
  );
}

const hd = StyleSheet.create({
  black: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  // Real-user mode: the mark and wordmark in text-3 at 30%, so a sighted helper sees the app is running.
  dimLogo: { width: 48, height: 48, marginBottom: 12, tintColor: 'rgba(142,142,147,0.3)' },
  dimMark: { color: 'rgba(142,142,147,0.3)', fontFamily: fonts.text, fontSize: 30, fontWeight: '600', letterSpacing: 0.5 },
  shade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  glow1: { borderWidth: 3, borderColor: colors.listen },
  glow2: { margin: 3, borderWidth: 10, borderColor: 'rgba(76,207,230,0.28)' },
  glow3: { margin: 13, borderWidth: 14, borderColor: 'rgba(76,207,230,0.10)' },
});
