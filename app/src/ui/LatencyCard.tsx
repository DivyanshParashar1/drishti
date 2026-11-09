import { StyleSheet, Text, View } from 'react-native';
import type { Latency, Toast } from './hudStore';
import { TONE } from './parts';
import { colors, fonts, shape } from './tokens';

/** "38 ms" under a second, "1.4 s" above. */
export function formatMs(ms: number, unitFrom = ms): { value: string; unit: 'ms' | 's' } {
  return unitFrom >= 1000 ? { value: (ms / 1000).toFixed(1), unit: 's' } : { value: String(Math.round(ms)), unit: 'ms' };
}

/**
 * F12 latency card: the latest event's measured latency (alert/name: frame → sound; answer/read:
 * release → first sound), with that kind's rolling p50/p95. Measured values only.
 */
export function LatencyCard({ latency, top }: { latency: Latency | null; top: number }) {
  if (!latency) {
    return (
      <View style={[lc.card, { top }]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
        <Text style={lc.label}>LATENCY</Text>
        <Text style={lc.hero}>—</Text>
        <Text style={lc.wait}>waiting for first alert</Text>
      </View>
    );
  }
  const hero = formatMs(latency.ms);
  const spread = latency.p50 !== null && latency.p95 !== null ? latency : null;
  const unitFrom = spread ? spread.p95! : 0;
  return (
    <View style={[lc.card, { top }]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <View style={lc.row}>
        <View style={lc.kind}>
          <View style={[lc.square, { backgroundColor: TONE[latency.tone] }]} />
          <Text style={lc.label}>{latency.label}</Text>
        </View>
        <Text style={lc.where}>{latency.where}</Text>
      </View>
      <Text style={lc.hero}>
        {hero.value}
        <Text style={lc.unit}> {hero.unit}</Text>
      </Text>
      {spread && (
        <Text style={lc.stats}>
          {`p50 ${formatMs(spread.p50!, unitFrom).value} · p95 ${formatMs(spread.p95!, unitFrom).value} ${formatMs(0, unitFrom).unit}`}
        </Text>
      )}
    </View>
  );
}

const TOAST_COLOR = { offline: colors.offline, online: colors.online, brand: colors.brand };

/** One-line toast under the strip (internet lost/back 3 s, demo mode 1 s). */
export function ToastView({ toast, top }: { toast: Toast; top: number }) {
  return (
    <View style={[lc.toast, { top }]} pointerEvents="none" accessibilityLiveRegion="polite">
      <Text style={[lc.toastText, { color: TOAST_COLOR[toast.tone] }, toast.tone === 'brand' && lc.caps]}>
        {toast.tone === 'brand' ? `✓  ${toast.text}` : toast.text}
      </Text>
    </View>
  );
}

const lc = StyleSheet.create({
  card: { position: 'absolute', right: shape.latencyCardRight, width: shape.latencyCardWidth, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.scrim, borderRadius: shape.radiusPanel },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  square: { width: 8, height: 8, borderRadius: 2 },
  label: { color: colors.text, fontFamily: fonts.text, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  where: { color: colors.text2, fontFamily: fonts.text, fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  hero: { color: colors.text, fontFamily: fonts.mono, fontSize: 22, fontWeight: '600', marginTop: 4, lineHeight: 27 },
  unit: { color: colors.text2, fontFamily: fonts.mono, fontSize: 13, fontWeight: '500' },
  stats: { color: colors.text2, fontFamily: fonts.mono, fontSize: 12, fontWeight: '500', marginTop: 2 },
  wait: { color: colors.text2, fontFamily: fonts.text, fontSize: 12, marginTop: 2 },
  toast: { position: 'absolute', left: shape.margin, height: 34, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: colors.scrim, borderRadius: shape.radiusChip },
  toastText: { fontFamily: fonts.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  caps: { textTransform: 'uppercase', letterSpacing: 0.6 },
});
