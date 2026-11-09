import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { Services } from '../core/services';
import type { ModelState } from '../vision/useReflexCamera';
import type { HudState } from './hudStore';
import { Chip, ChipText, Dot, LANG_CHIP, MicIcon, Spinner } from './parts';
import { colors, fonts, shape } from './tokens';

/**
 * F12 status strip: wordmark · language · online/offline · mode chips · voice state, and the
 * voice-pack download bar while fixed phrases are being fetched. Wraps to a second row when it
 * overflows (offline badge, several modes, 360 dp).
 */
export function StatusStrip({
  hud,
  services,
  detector,
  facesOn,
  top,
  onLayout,
}: {
  hud: HudState;
  services: Services;
  detector: ModelState['state'];
  facesOn: boolean;
  top: number;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const pack = usePhrasePack(services);
  const lang = hud.lang;
  const flash = hud.langFlash;
  return (
    <View style={[st.strip, { top }]} onLayout={onLayout} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={st.row}>
        <Text style={st.wordmark}>Drishti</Text>
        <Chip color={flash ? colors.brand : colors.text} border={flash ? colors.brand : undefined}>
          {LANG_CHIP[lang]}
        </Chip>
        {hud.online === true && (
          <Chip color={colors.online} border="rgba(48,209,88,0.55)">
            <Dot color={colors.online} />
            <ChipText color={colors.online}>ONLINE</ChipText>
          </Chip>
        )}
        {hud.online === null && <Chip>…</Chip>}
        {detector === 'loading' && <Chip>STARTING…</Chip>}
        {detector === 'failed' && <Chip fill={colors.alertNear} color={colors.tagInk}>ALERTS OFF</Chip>}
        {services.reflex.quiet && <Chip>QUIET</Chip>}
        {hud.reading && <Chip>{`READING ${hud.reading.chunk}/${hud.reading.chunks}`}</Chip>}
        {hud.enrol !== 'idle' && hud.enrol !== 'ask_delete_name' && <Chip>SAVING…</Chip>}
        {!facesOn && <Chip>FACES OFF</Chip>}
        {pack && <Chip mono style={st.end}>{`Voice pack ${pack.ready}/${pack.total}`}</Chip>}
        <View style={pack ? undefined : st.end}>
          {hud.voice === 'listening' ? (
            <Chip color={colors.brand} border={colors.brand}>
              <Dot color={colors.brand} />
              <ChipText color={colors.brand}>LISTENING</ChipText>
            </Chip>
          ) : hud.voice === 'thinking' ? (
            <Chip>
              <Spinner />
              <ChipText>THINKING</ChipText>
            </Chip>
          ) : (
            <MicIcon />
          )}
        </View>
        {hud.online === false && (
          <>
            <View style={st.break} />
            <Chip color={colors.offline} border={colors.offline}>
              <ChipText color={colors.offline}>{'✈︎'}</ChipText>
              <ChipText color={colors.offline}>OFFLINE · ALERTS ON DEVICE</ChipText>
            </Chip>
          </>
        )}
      </View>
      {pack && (
        <View style={st.bar}>
          <View style={[st.barFill, { width: `${Math.round((100 * pack.ready) / pack.total)}%` }]} />
        </View>
      )}
    </View>
  );
}

/** "Voice pack 34/61" while Timbre phrases for the current language are being fetched. */
function usePhrasePack(services: Services): { ready: number; total: number } | null {
  const [pack, setPack] = useState<{ ready: number; total: number } | null>(null);
  useEffect(() => {
    const poll = () => {
      const p = services.phrases.progress(services.lang);
      const show = services.phrases.syncing && p.ready < p.total;
      setPack((old) => (!show ? null : old && old.ready === p.ready && old.total === p.total ? old : p));
    };
    poll();
    const t = setInterval(poll, 1000);
    return () => clearInterval(t);
  }, [services]);
  return pack;
}

const st = StyleSheet.create({
  strip: { position: 'absolute', left: shape.margin, right: shape.margin, minHeight: shape.stripMinHeight, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.scrim, borderRadius: shape.radiusPanel, justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 6 },
  wordmark: { color: colors.brand, fontFamily: fonts.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.2, marginRight: 2 },
  end: { marginLeft: 'auto' },
  break: { flexBasis: '100%', height: 0 },
  bar: { height: 3, marginTop: 6, marginHorizontal: 0, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: 3, borderRadius: 2, backgroundColor: colors.brand },
});
