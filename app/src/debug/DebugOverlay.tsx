import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { Utterance } from '../audio/scheduler';
import type { Services } from '../core/services';

/**
 * Debug overlay shell (F10): live p50/p95 per stage, metrics export, and the P5 device-check
 * buttons (DT-5.1 stitched clips, DT-5.2 P0 interrupting a long answer).
 */
export function DebugOverlay({ services }: { services: Services }) {
  const { metrics, scheduler, connectivity, lang } = services;
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const enqueue = (u: Omit<Utterance, 'id' | 'createdAt' | 'lang'>, kind: 'reflex' | 'describe' | 'system') => {
    const id = metrics.start(kind, 'enqueued');
    scheduler.enqueue({ ...u, id, lang, createdAt: performance.now() });
  };

  const stitch = () =>
    enqueue(
      {
        priority: 2,
        source: 'reflex',
        frameId: Date.now(),
        parts: [
          { kind: 'clip', key: 'obj.chair' },
          { kind: 'clip', key: 'dir.ahead' },
          { kind: 'clip', key: 'dist.near' },
        ],
      },
      'reflex',
    );
  const longAnswer = () =>
    enqueue(
      {
        priority: 3,
        source: 'answer',
        parts: [
          {
            kind: 'speak',
            text:
              'Aage ek lamba footpath hai, jiske left mein kuch dukaanein hain aur right mein sadak hai. ' +
              'Footpath par thodi bheed hai, isliye dheere chaliye aur apni cane ka istemaal kariye.',
          },
        ],
      },
      'describe',
    );
  const hazard = () =>
    enqueue(
      {
        priority: 0,
        source: 'reflex',
        parts: [
          { kind: 'clip', key: 'obj.bus' },
          { kind: 'clip', key: 'dir.left' },
          { kind: 'clip', key: 'dist.near' },
        ],
      },
      'reflex',
    );
  const exportMetrics = () => void Share.share({ title: 'Drishti metrics', message: metrics.exportJson() });

  const summary = metrics.summary();
  return (
    <View style={styles.root} pointerEvents="box-none">
      <ScrollView style={styles.panel}>
        <Text style={styles.title}>
          Debug · {lang} · {connectivity.online === null ? 'checking…' : connectivity.online ? 'Online' : 'OFFLINE'} ·
          queue {scheduler.pending.length}
        </Text>
        {Object.entries(summary).map(([kind, stages]) => (
          <Text key={kind} style={styles.text}>
            {kind}:{' '}
            {Object.entries(stages)
              .map(([stage, s]) => `${stage} ${Math.round(s.p50)}/${Math.round(s.p95)} (n${s.n})`)
              .join(' · ')}
          </Text>
        ))}
        {Object.keys(summary).length === 0 && <Text style={styles.text}>no events yet (p50/p95 ms)</Text>}
        <View style={styles.row}>
          <Button label="Stitch (DT-5.1)" onPress={stitch} />
          <Button label="Long answer" onPress={longAnswer} />
          <Button label="P0 now (DT-5.2)" onPress={hazard} />
        </View>
        <View style={styles.row}>
          <Button label="Stop all" onPress={() => scheduler.stopAll()} />
          <Button label="Export metrics" onPress={exportMetrics} />
        </View>
      </ScrollView>
    </View>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.button} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingTop: 40 },
  panel: { maxHeight: '45%', backgroundColor: '#000c', padding: 10 },
  title: { color: '#6f6', fontSize: 14, fontWeight: '600', marginBottom: 6 },
  text: { color: '#fff', fontSize: 12, marginBottom: 4, fontFamily: 'monospace' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  button: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6 },
  buttonText: { color: '#fff', fontSize: 13 },
});
