import { useEffect } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClipKey } from '../audio/clips.generated';
import { colors, fonts, shape, type } from './tokens';

export type PermissionKind = 'camera' | 'microphone';

const COPY: Record<PermissionKind, { title: string; body: string; button: string; key: ClipKey }> = {
  camera: { title: 'Allow the camera', body: "Drishti needs the camera to see what's ahead.", button: 'Allow camera', key: 'sys.perm_camera' },
  microphone: { title: 'Allow the microphone', body: 'Drishti needs the microphone to hear your questions.', button: 'Allow microphone', key: 'sys.perm_mic' },
};

/**
 * F12 permission screens: black, centred, one large button (the only normal button in the app).
 * When the permission can no longer be requested, the button opens Settings. The text is also
 * spoken. The microphone screen can be skipped: alerts work without it.
 */
export function PermissionScreen({
  kind,
  canRequest,
  onRequest,
  onSkip,
  say,
}: {
  kind: PermissionKind;
  canRequest: boolean;
  onRequest: () => void;
  onSkip?: () => void;
  say: (key: ClipKey) => void;
}) {
  const c = COPY[kind];
  const settings = !canRequest;
  const body = settings ? `Open Settings and allow the ${kind}.` : c.body;
  useEffect(() => {
    say(settings && kind === 'camera' ? 'sys.perm_settings' : c.key);
  }, [kind, settings, c.key, say]);
  return (
    <View style={ps.root}>
      <Text style={ps.wordmark}>Drishti</Text>
      <View style={ps.group}>
        <View style={ps.icon}>
          {kind === 'camera' ? (
            <>
              <View style={ps.eyeOuter} />
              <View style={ps.eyePupil} />
            </>
          ) : (
            <>
              <View style={ps.micHead} />
              <View style={ps.micCup} />
            </>
          )}
        </View>
        <Text style={ps.title} accessibilityRole="header">
          {c.title}
        </Text>
        <Text style={ps.body}>{body}</Text>
        <Pressable style={({ pressed }) => [ps.button, pressed && ps.pressed]} onPress={settings ? () => void Linking.openSettings() : onRequest} accessibilityRole="button">
          <Text style={ps.buttonText}>{settings ? 'Open settings' : c.button}</Text>
        </Pressable>
        {onSkip && (
          <Pressable onPress={onSkip} accessibilityRole="button" hitSlop={12}>
            <Text style={ps.skip}>Not now</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const ps = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg },
  wordmark: { position: 'absolute', top: 48, left: 0, right: 0, textAlign: 'center', color: colors.brand, fontFamily: fonts.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  group: { flex: 1, marginHorizontal: shape.margin, alignItems: 'center', justifyContent: 'center', gap: 16 },
  icon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  eyeOuter: { position: 'absolute', width: 56, height: 32, borderRadius: 16, borderWidth: 2.5, borderColor: colors.brand },
  eyePupil: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 2.5, borderColor: colors.brand },
  micHead: { position: 'absolute', top: 8, width: 18, height: 30, borderRadius: 9, borderWidth: 2.5, borderColor: colors.brand },
  micCup: { position: 'absolute', top: 24, width: 34, height: 22, borderWidth: 2.5, borderTopWidth: 0, borderBottomLeftRadius: 17, borderBottomRightRadius: 17, borderColor: colors.brand },
  title: { color: colors.text, fontFamily: fonts.text, fontSize: type.title.fontSize, fontWeight: '700', lineHeight: 26, textAlign: 'center' },
  body: { color: colors.text2, fontFamily: fonts.text, fontSize: 16, lineHeight: 24, maxWidth: 320, textAlign: 'center' },
  button: { alignSelf: 'stretch', height: 56, marginTop: 20, borderRadius: shape.radiusPanel, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  buttonText: { color: colors.tagInk, fontFamily: fonts.text, fontSize: 18, fontWeight: '700' },
  skip: { color: colors.text2, fontFamily: fonts.text, fontSize: 15, fontWeight: '600', padding: 8 },
});
