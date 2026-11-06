import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { createServices, startServices } from './src/core/services';
import { DebugOverlay } from './src/debug/DebugOverlay';
import { createTapCounter } from './src/debug/tapCounter';
import { BootScreen } from './src/screens/BootScreen';

export default function App() {
  useKeepAwake(); // the camera can't run in the background, so keep the screen on (F10)
  const services = useMemo(createServices, []);
  const [debug, setDebug] = useState(false);
  const tap = useRef(createTapCounter()).current;

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
      <BootScreen />
      {debug && <DebugOverlay services={services} />}
    </View>
  );
}
