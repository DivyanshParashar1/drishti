import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Camera, useCameraPermission } from 'react-native-vision-camera';
import type { Services } from '../core/services';
import { boxToView } from '../vision/boxLayout';
import type { DetectorId } from '../vision/config';
import type { FrameResult } from '../vision/reflexLane';
import { useReflexCamera } from '../vision/useReflexCamera';

const FAILURES_BEFORE_SPEAKING = 5;

/** Camera + Reflex lane (F1/F2). Boxes, labels and track ids show in debug mode. */
export function ReflexScreen({ services, detector, debug }: { services: Services; detector: DetectorId; debug: boolean }) {
  const { reflex, scheduler, metrics } = services;
  const { hasPermission, requestPermission } = useCameraPermission();
  const [, setTick] = useState(0);
  const [view, setView] = useState({ width: 0, height: 0 });
  const [lastError, setLastError] = useState<string | null>(null);
  const failures = useRef(0);
  const spokeFailure = useRef(false);

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  const speakFailure = useCallback(() => {
    if (spokeFailure.current) return;
    spokeFailure.current = true;
    const id = metrics.start('system', 'enqueued');
    metrics.note(id, 'detector_failed');
    scheduler.enqueue({
      id,
      priority: 1,
      source: 'system',
      lang: services.lang,
      createdAt: performance.now(),
      parts: [{ kind: 'clip', key: 'sys.detector_failed' }],
    });
  }, [metrics, scheduler, services.lang]);

  const onResult = useCallback(
    (r: FrameResult) => {
      failures.current = 0;
      reflex.handle(r);
    },
    [reflex],
  );
  const onError = useCallback(
    (message: string) => {
      setLastError(message);
      if (++failures.current === FAILURES_BEFORE_SPEAKING) speakFailure();
    },
    [speakFailure],
  );

  const { frameOutput, status } = useReflexCamera(onResult, onError, detector);

  useEffect(() => {
    if (status.state === 'failed') speakFailure(); // §9: spoken error, no silent failure
  }, [status.state, speakFailure]);

  useEffect(() => reflex.onUpdate(() => debug && setTick((n) => n + 1)), [reflex, debug]);

  const onLayout = (e: LayoutChangeEvent) => setView(e.nativeEvent.layout);
  const s = reflex.stats;
  const statusText =
    status.state === 'loading'
      ? `${detector}: loading…`
      : status.state === 'failed'
        ? `${detector}: FAILED ${status.error}`
        : `${detector} ${status.delegate} · load ${status.loadMs.toFixed(0)} ms · infer ${s.lastInferMs.toFixed(0)} ms · total ${s.lastTotalMs.toFixed(0)} ms · ${s.detectionsPerSec.toFixed(1)} det/s`;

  return (
    <View style={styles.root} onLayout={onLayout}>
      {hasPermission ? (
        <Camera style={StyleSheet.absoluteFill} device="back" isActive outputs={[frameOutput]} />
      ) : (
        <Text style={styles.text}>Camera permission needed</Text>
      )}
      {debug &&
        reflex.frameSize.width > 0 &&
        reflex.visible.map((t) => {
          const r = boxToView(t.box, reflex.frameSize, view);
          return (
            <View key={t.id} pointerEvents="none" style={[styles.box, r, t.dist === 'near' && styles.near]}>
              <Text style={styles.boxLabel}>
                #{t.id} {t.label} {t.dir} {t.dist} {(t.score * 100).toFixed(0)}%
              </Text>
            </View>
          );
        })}
      {debug && (
        <View style={styles.status} pointerEvents="none">
          <Text style={styles.text}>{statusText}</Text>
          {reflex.quiet && <Text style={styles.text}>quiet mode</Text>}
          {lastError && <Text style={styles.error}>last frame error: {lastError}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  box: { position: 'absolute', borderWidth: 2, borderColor: '#ffd400' },
  near: { borderColor: '#ff3b30', borderWidth: 3 },
  boxLabel: { color: '#000', backgroundColor: '#ffd400', fontSize: 11, alignSelf: 'flex-start', paddingHorizontal: 2 },
  status: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#000a', padding: 8 },
  text: { color: '#fff', fontSize: 12 },
  error: { color: '#ff6b6b', fontSize: 12 },
});
