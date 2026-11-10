import { useAudioRecorder } from '@siteed/audio-studio';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo } from 'react';
import { TurboModuleRegistry } from 'react-native';
import { EARCONS, type EarconName } from '../audio/clips.generated';
import type { Services } from '../core/services';
import { ask, xhrTransport } from '../net/askClient';
import { base64ToBytes } from '../net/base64';
import { OfflineSttSession, onDeviceRecognizer } from '../net/offlineStt';
import { rnWebSocketFactory, SttSession } from '../net/sttClient';
import TextRecognition, { type TextRecognitionScript } from '@react-native-ml-kit/text-recognition';
import { readImage } from '../reading/ocr';
import { micLevel, pcmLevel } from '../ui/micLevel';
import { VoiceController } from './voiceController';
import { WakeService, type WakeControl, type WakeEngine } from './wakeWord';
import { VoskWake, type VoskApi } from './voskWake';
import { OwwEngine } from './oww';
import { RecorderFrameSource } from './recorderSource';
import { WAKE_FEATURE_ASSETS, WAKE_PHRASE, WAKE_WORD_ASSET } from '../models/detectorAssets';
import { loadBundledModel } from '../models/loadModel';

const MIC = { sampleRate: 16000, channels: 1, encoding: 'pcm_16bit', interval: 40 } as const;

type Recorder = ReturnType<typeof useAudioRecorder>;

/** Holds the latest recorder from the hook; read only when the user presses, never in render. */
class MicBridge {
  private recorder: Recorder | null = null;
  set(r: Recorder) {
    this.recorder = r;
  }
  get(): Recorder {
    if (!this.recorder) throw new Error('recorder not ready');
    return this.recorder;
  }
}

/** openWakeWord's three models on the app's TFLite runtime (CPU), as one engine. */
async function createOwwEngine(): Promise<WakeEngine> {
  const [mel, emb, ww] = await Promise.all([
    loadBundledModel(WAKE_FEATURE_ASSETS.melspec, []),
    loadBundledModel(WAKE_FEATURE_ASSETS.embedding, []),
    loadBundledModel(WAKE_WORD_ASSET, []),
  ]);
  const f32 = (b: ArrayBuffer) => new Float32Array(b);
  const copy = (x: Float32Array) => x.slice().buffer as ArrayBuffer;
  return new OwwEngine({
    melspec: (x) => f32(mel.runSync([copy(x)])[0]),
    embed: (m) => f32(emb.runSync([copy(m)])[0]),
    classify: (feats) => f32(ww.runSync([copy(feats)])[0])[0],
  });
}

/**
 * react-native-vosk, or null when this APK was built without it. Checked with
 * TurboModuleRegistry.get (returns null) before importing the package: its import calls
 * getEnforcing, which throws and shows a red error in dev builds even when caught.
 */
function loadVosk(): VoskApi | null {
  if (!TurboModuleRegistry.get('Vosk')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-vosk') as VoskApi;
  } catch {
    return null;
  }
}

/**
 * Builds the VoiceController with the real mic, /stt, /ask, files, haptics and earcons, and the
 * wake-word service (P17, openWakeWord). While the wake word is on it owns the mic and turns read from it.
 */
export function useVoiceController(services: Services): { voice: VoiceController; wake: WakeControl } {
  const recorder = useAudioRecorder();
  const mic = useMemo(() => new MicBridge(), []);
  useEffect(() => mic.set(recorder), [mic, recorder]);

  const earcons = useMemo(() => {
    const players = {} as Record<EarconName, AudioPlayer>;
    for (const name of Object.keys(EARCONS) as EarconName[]) players[name] = createAudioPlayer(EARCONS[name]);
    return players;
  }, []);

  // Mic permission is requested by ReflexScreen right after the camera's (one dialog at a time).
  useEffect(() => () => Object.values(earcons).forEach((p) => p.remove()), [earcons]);

  return useMemo(() => {
    let audioN = 0;
    const transport = xhrTransport();
    const box: { wake: WakeControl | null } = { wake: null };
    const voice = new VoiceController({
      scheduler: services.scheduler,
      metrics: services.metrics,
      lang: () => services.lang,
      online: () => services.connectivity.online,
      reflex: services.reflex,
      startStt: (lang) => new SttSession(rnWebSocketFactory, lang),
      startOfflineStt: (lang) => {
        const rec = onDeviceRecognizer();
        if (!rec) return null;
        void box.wake?.suspend(); // the recognizer opens the mic itself
        return new OfflineSttSession(rec, lang);
      },
      startMic: async (onChunk) => {
        const wake = box.wake;
        if (wake?.ownsMic) {
          wake.tap((pcm, level) => {
            micLevel.emit(level); // F12 waveform
            onChunk(pcm);
          });
          return;
        }
        await wake?.releaseMic(); // Vosk listens on its own mic: let it go first
        await mic.get().startRecording({
          ...MIC,
          output: { primary: { enabled: false } },
          onAudioStream: async (e) => {
            if (typeof e.data === 'string') {
              const bytes = base64ToBytes(e.data);
              micLevel.emit(pcmLevel(bytes)); // F12 waveform
              onChunk(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
            }
          },
        });
      },
      stopMic: async () => {
        micLevel.emit(0);
        if (box.wake?.ownsMic) return box.wake.untap();
        await mic.get().stopRecording();
      },
      grabFrame: (mode) => services.frames.grabToFile(mode),
      ocr: async (uri) => (await readImage(uri, (u, script) => TextRecognition.recognize(u, script as TextRecognitionScript))).paragraphs,
      reading: services.reader,
      ask: (req, onEvent) => ask(transport, req, onEvent),
      writeAudio: async (b64) => {
        const file = new File(Paths.cache, `ans-${audioN++ % 30}.mp3`);
        await file.write(base64ToBytes(b64));
        return file.uri;
      },
      present: () => services.faces.presentPeople(),
      dialog: services.enrollment,
      setLanguage: (lang) => services.setLanguage(lang),
      tutorial: () => services.tutorial(),
      setDemoMode: (on) => services.setDemoMode(on),
      haptic: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      earcon: (name) => {
        const p = earcons[name];
        void p.seekTo(0).then(() => p.play());
      },
    });
    // While the wake word is on, this recorder stream is the only mic: turns tap it (startMic above).
    const wakeSource = new RecorderFrameSource({
      start: async (onPcm) => {
        await mic.get().startRecording({
          ...MIC,
          output: { primary: { enabled: false } },
          onAudioStream: async (e) => {
            if (typeof e.data === 'string') onPcm(base64ToBytes(e.data));
          },
        });
      },
      stop: async () => {
        await mic.get().stopRecording();
      },
    });
    const common = {
      target: voice,
      scheduler: services.scheduler,
      noSpeech: () => services.say('sys.didnt_hear'),
      online: () => services.connectivity.online,
    };
    // "दृष्टि" with Vosk when this APK has it; otherwise openWakeWord's "Hey Jarvis" (no rebuild).
    const vosk = loadVosk();
    box.wake = vosk
      ? new VoskWake({ ...common, vosk, micLevel })
      : new WakeService({ ...common, createEngine: createOwwEngine, source: wakeSource, configured: true }, undefined, undefined, WAKE_PHRASE);
    return { voice, wake: box.wake };
  }, [services, earcons, mic]);
}
