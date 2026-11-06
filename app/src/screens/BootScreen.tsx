import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraPermission } from 'react-native-vision-camera';
import { DETECTOR_ASSETS, type DetectorId } from '../models/detectorAssets';
import { describeTensors, loadWithFallback } from '../models/loadModel';

type ModelStatus = { state: 'loading' } | { state: 'ok'; text: string } | { state: 'error'; text: string };

// P0 smoke screen: camera preview + both detector models loaded, with timings.
export function BootScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [status, setStatus] = useState<Record<DetectorId, ModelStatus>>({
    efficientdet_lite0: { state: 'loading' },
    yolo11n: { state: 'loading' },
  });

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    (Object.keys(DETECTOR_ASSETS) as DetectorId[]).forEach(async (id) => {
      try {
        const { model, delegate, loadMs } = await loadWithFallback(DETECTOR_ASSETS[id]);
        const text = `${delegate}, ${loadMs.toFixed(0)} ms\n${describeTensors(model)}`;
        setStatus((s) => ({ ...s, [id]: { state: 'ok', text } }));
      } catch (e) {
        setStatus((s) => ({ ...s, [id]: { state: 'error', text: String(e) } }));
      }
    });
  }, []);

  return (
    <View style={styles.root}>
      {hasPermission ? (
        <Camera style={StyleSheet.absoluteFill} device="back" isActive />
      ) : (
        <Text style={styles.text}>Camera permission needed</Text>
      )}
      <ScrollView style={styles.panel}>
        {(Object.keys(status) as DetectorId[]).map((id) => {
          const s = status[id];
          return (
            <Text key={id} style={styles.text}>
              {id}: {s.state === 'loading' ? 'loading…' : `${s.state === 'ok' ? 'loaded' : 'FAILED'} — ${s.text}`}
            </Text>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '40%', backgroundColor: '#000a', padding: 12 },
  text: { color: '#fff', fontSize: 13, marginBottom: 8 },
});
