import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Camera } from 'react-native-vision-camera';
import type { Services } from '../core/services';
import { boxToView } from '../vision/boxLayout';
import type { DetectorId } from '../vision/config';
import type { FrameResult } from '../vision/reflexLane';
import { useReflexCamera, type ModelState } from '../vision/useReflexCamera';

const FAILURES_BEFORE_SPEAKING = 5;

/**
 * Camera + Reflex lane (F1/F2). Boxes, labels and track ids show in debug mode; the demo UI draws
 * its own (F12). Permissions are asked by App (F12 permission screens).
 */
export function ReflexScreen({
  services,
  detector,
  debug,
  facesOn,
  hasPermission,
  onStatus,
}: {
  services: Services;
  detector: DetectorId;
  debug: boolean;
  facesOn: boolean;
  hasPermission: boolean;
  onStatus?: (state: ModelState['state']) => void;
}) {
  const { reflex, scheduler, metrics, faces } = services;
  const [, setTick] = useState(0);
  const [view, setView] = useState({ width: 0, height: 0 });
  const [lastError, setLastError] = useState<string | null>(null);
  const failures = useRef(0);
  const spokeFailure = useRef(false);

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

  const { frameOutput, status, faceStatus, grab } = useReflexCamera(onResult, onError, detector, facesOn);

  useEffect(() => {
    services.frames.set(grab);
    return () => services.frames.set(null);
  }, [services.frames, grab]);

  useEffect(() => {
    if (status.state === 'failed') speakFailure(); // §9: spoken error, no silent failure
    onStatus?.(status.state);
  }, [status.state, speakFailure, onStatus]);

  useEffect(() => reflex.onUpdate(() => debug && setTick((n) => n + 1)), [reflex, debug]);

  const onLayout = (e: LayoutChangeEvent) => setView(e.nativeEvent.layout);
  const s = reflex.stats;
  const statusText =
    status.state === 'loading'
      ? `${detector}: loading…`
      : status.state === 'failed'
        ? `${detector}: FAILED ${status.error}`
        : `${detector} ${status.delegate} · load ${status.loadMs.toFixed(0)} ms · infer ${s.lastInferMs.toFixed(0)} ms · total ${s.lastTotalMs.toFixed(0)} ms · ${s.detectionsPerSec.toFixed(1)} det/s · top ${s.top}`;
  const faceText = !facesOn
    ? 'faces: off'
    : faceStatus.state === 'loading'
      ? 'faces: loading…'
      : faceStatus.state === 'failed'
        ? `faces: FAILED ${faceStatus.error}`
        : `faces: mobilefacenet ${faceStatus.delegate} · load ${faceStatus.loadMs.toFixed(0)} ms · face step ${s.lastFaceMs < 0 ? '–' : s.lastFaceMs.toFixed(0)} ms · ${s.faces} faces · ${services.identities.people.length} saved`;

  return (
    <View style={styles.root} onLayout={onLayout}>
      {hasPermission && <Camera style={StyleSheet.absoluteFill} device="back" isActive outputs={[frameOutput]} />}
      {debug &&
        reflex.frameSize.width > 0 &&
        reflex.visible.map((t) => {
          const r = boxToView(t.box, reflex.frameSize, view);
          const who = t.label === 'person' ? faces.decisionOf(t.id) : null;
          return (
            <View key={t.id} pointerEvents="none" style={[styles.box, r]}>
              <Text style={styles.boxLabel}>
                #{t.id} {t.label} {t.dir} {(t.score * 100).toFixed(0)}%
                {who ? ` · ${who.label}${who.sim !== null ? ` ${who.sim.toFixed(2)}` : ''}` : ''}
              </Text>
            </View>
          );
        })}
      {debug &&
        reflex.frameSize.width > 0 &&
        reflex.lastFaces.map((f, i) => (
          <View
            key={`f${i}`}
            pointerEvents="none"
            style={[styles.face, boxToView(f.box, reflex.frameSize, view), f.embedding === null && styles.faceSmall]}
          >
            <Text style={styles.faceLabel}>{Math.round(f.widthPx)} px</Text>
          </View>
        ))}
      {debug && (
        <View style={styles.status} pointerEvents="none">
          <Text style={styles.text}>{statusText}</Text>
          <Text style={styles.text}>{faceText}</Text>
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
  face: { position: 'absolute', borderWidth: 2, borderColor: '#34c759' },
  faceSmall: { borderColor: '#8e8e93', borderStyle: 'dashed' },
  faceLabel: { color: '#000', backgroundColor: '#34c759', fontSize: 10, alignSelf: 'flex-start', paddingHorizontal: 2 },
  boxLabel: { color: '#000', backgroundColor: '#ffd400', fontSize: 11, alignSelf: 'flex-start', paddingHorizontal: 2 },
  status: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#000a', padding: 8 },
  text: { color: '#fff', fontSize: 12 },
  error: { color: '#ff6b6b', fontSize: 12 },
});
