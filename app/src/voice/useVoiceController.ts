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
import { VoiceController } from './voiceController';

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

/** Builds the VoiceController with the real mic, /stt, /ask, files, haptics and earcons. */
export function useVoiceController(services: Services): VoiceController {
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
    return new VoiceController({
      scheduler: services.scheduler,
      metrics: services.metrics,
      lang: () => services.lang,
      online: () => services.connectivity.online,
      reflex: services.reflex,
      startStt: (lang) => new SttSession(rnWebSocketFactory, lang),
      startOfflineStt: (lang) => {
        const rec = onDeviceRecognizer();
        return rec ? new OfflineSttSession(rec, lang) : null;
      },
      startMic: async (onChunk) => {
        await mic.get().startRecording({
          ...MIC,
          output: { primary: { enabled: false } },
          onAudioStream: async (e) => {
            if (typeof e.data === 'string') {
              const bytes = base64ToBytes(e.data);
              onChunk(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
            }
          },
        });
      },
      stopMic: async () => {
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
      haptic: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      earcon: (name) => {
        const p = earcons[name];
        void p.seekTo(0).then(() => p.play());
      },
    });
  }, [services, earcons, mic]);
}
