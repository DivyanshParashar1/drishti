import { useAudioRecorder } from '@siteed/audio-studio';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo } from 'react';
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
import { WakeService, type FrameSource, type WakeEngine } from './wakeWord';
import { PICOVOICE_KEY, WAKE_KEYWORD_FILE } from '../core/config';

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

/** Picovoice's VoiceProcessor, required on first use (the module exists only in rebuilt APKs). */
function voiceProcessorSource(): FrameSource {
  type VP = FrameSource;
  let vp: VP | null = null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const get = (): VP => (vp ??= require('@picovoice/react-native-voice-processor').VoiceProcessor.instance as VP);
  const quietly = (f: () => void) => {
    try {
      f();
    } catch {
      // module missing: nothing was added
    }
  };
  return {
    start: (len, rate) => get().start(len, rate),
    stop: () => get().stop(),
    addFrameListener: (cb) => get().addFrameListener(cb),
    removeFrameListener: (cb) => quietly(() => get().removeFrameListener(cb)),
    addErrorListener: (cb) => get().addErrorListener(cb),
    removeErrorListener: (cb) => quietly(() => get().removeErrorListener(cb)),
  };
}

/** Porcupine with the custom "Drishti" keyword (assets/wake/drishti_android.ppn, copied into the APK). */
async function createPorcupine(): Promise<WakeEngine> {
  let mod: { Porcupine: { fromKeywordPaths(key: string, paths: string[], model?: string, device?: string, sens?: number[]): Promise<WakeEngine> } };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@picovoice/porcupine-react-native');
  } catch {
    throw new Error('Porcupine is not in this build: rebuild the APK');
  }
  const p = await mod.Porcupine.fromKeywordPaths(PICOVOICE_KEY, [WAKE_KEYWORD_FILE], '', '', [0.6]);
  return { frameLength: p.frameLength, sampleRate: p.sampleRate, process: (f) => p.process(f), delete: () => p.delete() };
}

/**
 * Builds the VoiceController with the real mic, /stt, /ask, files, haptics and earcons, and the
 * wake-word service (P17). While the wake word is on it owns the mic and turns read from it.
 */
export function useVoiceController(services: Services): { voice: VoiceController; wake: WakeService } {
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
    const box: { wake: WakeService | null } = { wake: null };
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
    box.wake = new WakeService({
      createEngine: createPorcupine,
      source: voiceProcessorSource(),
      target: voice,
      scheduler: services.scheduler,
      noSpeech: () => services.say('sys.didnt_hear'),
      online: () => services.connectivity.online,
      configured: PICOVOICE_KEY !== '',
    });
    return { voice, wake: box.wake };
  }, [services, earcons, mic]);
}
