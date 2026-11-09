import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import { createServices, startServices } from './src/core/services';
import { DebugOverlay } from './src/debug/DebugOverlay';
import { createTapCounter } from './src/debug/tapCounter';
import { IDENTITY } from './src/identity/config';
import { ReflexScreen } from './src/screens/ReflexScreen';
import { DemoBoxes } from './src/ui/DemoBoxes';
import { TwoFingerHold } from './src/ui/gestures';
import { Hud } from './src/ui/Hud';
import { HudStore } from './src/ui/hudStore';
import { useHud } from './src/ui/parts';
import { PermissionScreen } from './src/ui/PermissionScreen';
import { VISION, type DetectorId } from './src/vision/config';
import type { ModelState } from './src/vision/useReflexCamera';
import { TalkSurface } from './src/voice/TalkSurface';
import { useVoiceController } from './src/voice/useVoiceController';

export default function App() {
  useKeepAwake(); // the camera can't run in the background, so keep the screen on (F10)
  const services = useMemo(createServices, []);
  const [debug, setDebug] = useState(false);
  const [detector, setDetector] = useState<DetectorId>(VISION.detector);
  const [detectorState, setDetectorState] = useState<ModelState['state']>('loading');
  const [facesOn, setFacesOn] = useState(true);
  const [demo, setDemo] = useState(services.demoMode);
  const tap = useRef(createTapCounter()).current;
  const templeTouch = useRef(false);
  const voice = useVoiceController(services);
  const perms = usePermissions();

  const store = useMemo(
    () =>
      new HudStore({
        scheduler: services.scheduler,
        metrics: services.metrics,
        voice,
        reader: services.reader,
        enrollment: services.enrollment,
        connectivity: services.connectivity,
        lang: () => services.lang,
        langChanged: services.langChanged,
        demoChanged: services.demoChanged,
        firstRun: () => services.firstRun,
        say: (key) => services.say(key),
        captureMs: IDENTITY.enrollCaptureMs,
      }),
    [services, voice],
  );
  useEffect(() => () => store.dispose(), [store]);
  useEffect(() => services.demoChanged.on((on) => setDemo(on)), [services]);

  // F12: two fingers held 2 s anywhere toggle demo mode; the talk the first finger started is dropped.
  const hold = useMemo(() => new TwoFingerHold({ onTwo: () => void voice.cancel(), onFire: () => services.setDemoMode(!services.demoMode) }), [voice, services]);
  useEffect(() => () => hold.dispose(), [hold]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    startServices(services)
      .then((c) => (cleanup = c))
      .catch((e) => console.warn('startServices failed', e));
    return () => cleanup?.();
  }, [services]);

  const onTouchEnd = (e: GestureResponderEvent) => {
    hold.touches(e.nativeEvent.touches.length);
    if (templeTouch.current) {
      templeTouch.current = false; // right-temple taps never count towards the debug triple-tap
      return;
    }
    if (hold.countsAsTap && tap()) setDebug((d) => !d);
  };

  return (
    <View
      style={{ flex: 1, backgroundColor: '#000' }}
      onTouchStart={(e) => hold.touches(e.nativeEvent.touches.length)}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => hold.touches(0)}
    >
      <StatusBar style="light" />
      <ReflexScreen services={services} detector={detector} debug={debug} facesOn={facesOn} hasPermission={perms.camera.granted} onStatus={setDetectorState} />
      {demo && !debug && <BoxesLayer services={services} store={store} />}
      <TalkSurface voice={voice} />
      <Hud services={services} voice={voice} store={store} demo={demo} detector={detectorState} facesOn={facesOn} onTempleTouch={() => (templeTouch.current = true)} />
      {debug && (
        <DebugOverlay
          services={services}
          voice={voice}
          detector={detector}
          onSwitchDetector={() => setDetector((d) => (d === 'yolo11n' ? 'efficientdet_lite0' : 'yolo11n'))}
          facesOn={facesOn}
          onToggleFaces={() => setFacesOn((f) => !f)}
        />
      )}
      {perms.screen && <PermissionScreen kind={perms.screen.kind} canRequest={perms.screen.canRequest} onRequest={perms.screen.request} onSkip={perms.screen.skip} say={services.say} />}
    </View>
  );
}

function BoxesLayer({ services, store }: { services: ReturnType<typeof createServices>; store: HudStore }) {
  const hud = useHud(store);
  return <DemoBoxes services={services} hud={hud} />;
}

/**
 * Camera, then microphone, one at a time at startup (Android shows one dialog at a time; a request
 * made while another is open never completes). Afterwards, F12 permission screens for whatever is
 * still missing. The microphone screen can be skipped: alerts work without it.
 */
function usePermissions() {
  const cam = useCameraPermission();
  const mic = useMicrophonePermission();
  const [asking, setAsking] = useState(true);
  const [micSkipped, setMicSkipped] = useState(false);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void (async () => {
      try {
        if (!cam.hasPermission && cam.canRequestPermission) await cam.requestPermission();
      } catch {
        // denied or interrupted: the camera screen follows
      }
      try {
        if (!mic.hasPermission && mic.canRequestPermission) await mic.requestPermission();
      } catch {
        // denied: the microphone screen follows; without it STT fails and says "Samajh nahi aaya"
      }
      setAsking(false);
    })();
  }, [cam, mic]);

  const request = useCallback((p: typeof cam) => () => void p.requestPermission().catch(() => false), []);
  let screen: { kind: 'camera' | 'microphone'; canRequest: boolean; request: () => void; skip?: () => void } | null = null;
  if (!asking && !cam.hasPermission) screen = { kind: 'camera', canRequest: cam.canRequestPermission, request: request(cam) };
  else if (!asking && !mic.hasPermission && !micSkipped) {
    screen = { kind: 'microphone', canRequest: mic.canRequestPermission, request: request(mic), skip: () => setMicSkipped(true) };
  }
  return { camera: { granted: cam.hasPermission }, screen };
}
