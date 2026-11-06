import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { createServices, startServices } from './src/core/services';
import { DebugOverlay } from './src/debug/DebugOverlay';
import { createTapCounter } from './src/debug/tapCounter';
import { ReflexScreen } from './src/screens/ReflexScreen';
import { VISION, type DetectorId } from './src/vision/config';
import { TalkSurface } from './src/voice/TalkSurface';
import { useVoiceController } from './src/voice/useVoiceController';

export default function App() {
  useKeepAwake(); // the camera can't run in the background, so keep the screen on (F10)
  const services = useMemo(createServices, []);
  const [debug, setDebug] = useState(false);
  const [detector, setDetector] = useState<DetectorId>(VISION.detector);
  const tap = useRef(createTapCounter()).current;
  const voice = useVoiceController(services);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    startServices(services)
      .then((c) => (cleanup = c))
      .catch((e) => console.warn('startServices failed', e));
    return () => cleanup?.();
  }, [services]);

  return (
    <View style={{ flex: 1 }} onTouchEnd={() => tap() && setDebug((d) => !d)}>
      <StatusBar style="light" />
      <ReflexScreen services={services} detector={detector} debug={debug} />
      <TalkSurface voice={voice} />
      {debug && (
        <DebugOverlay
          services={services}
          voice={voice}
          detector={detector}
          onSwitchDetector={() => setDetector((d) => (d === 'yolo11n' ? 'efficientdet_lite0' : 'yolo11n'))}
        />
      )}
    </View>
  );
}
