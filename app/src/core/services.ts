import { ClipPlayer } from '../audio/clipPlayer';
import { ExpoAudioBackend } from '../audio/expoBackend';
import { SpeechScheduler, type AudioPart } from '../audio/scheduler';
import { openDatabaseSync } from 'expo-sqlite';
import { deleteFiles, writeNameClip } from '../identity/clipFiles';
import { IDENTITY } from '../identity/config';
import { EnrollmentDialog } from '../identity/enrollment';
import { FaceIdentifier } from '../identity/identifier';
import { NameClipSync } from '../identity/nameClips';
import { fetchTts } from '../net/ttsClient';
import { IdentityStore, type SqlDb } from '../identity/store';
import { ReflexLane } from '../vision/reflexLane';
import { createConnectivityMonitor, type ConnectivityMonitor } from './connectivity';
import { FrameGrabber } from './frameGrabber';
import { DEFAULT_LANG, type Lang } from './lang';
import { Metrics } from './metrics';

/** The app's long-lived singletons, created once at startup. */
export interface Services {
  metrics: Metrics;
  player: ClipPlayer;
  scheduler: SpeechScheduler;
  connectivity: ConnectivityMonitor;
  reflex: ReflexLane;
  frames: FrameGrabber;
  identities: IdentityStore;
  faces: FaceIdentifier;
  nameClips: NameClipSync;
  enrollment: EnrollmentDialog;
  lang: Lang;
}

export function createServices(): Services {
  const metrics = new Metrics();
  const player = new ClipPlayer(new ExpoAudioBackend());
  const scheduler = new SpeechScheduler(player, {
    onStart: (u, at) => metrics.mark(u.id, 'play_start', at),
    onEnd: (u, reason) => {
      metrics.mark(u.id, 'play_end');
      if (reason !== 'done') metrics.note(u.id, reason);
    },
    onDrop: (u, reason) => metrics.note(u.id, `dropped_${reason}`),
  });
  const reflex = new ReflexLane(scheduler, metrics, DEFAULT_LANG);
  const identities = new IdentityStore(openDatabaseSync('drishti.db') as unknown as SqlDb);
  const services = {} as Services;
  const faces = new FaceIdentifier({
    scheduler,
    metrics,
    lang: () => services.lang,
    people: () => identities.people,
  });
  reflex.faces = faces;
  const connectivity = createConnectivityMonitor();
  const nameClips = new NameClipSync({
    store: identities,
    tts: fetchTts,
    writeClip: writeNameClip,
    online: () => connectivity.online,
  });
  // F4 prompts and confirmations are P4 system lines (never dropped as stale).
  const speak = (parts: AudioPart[]) => {
    const id = metrics.start('system', 'enqueued');
    scheduler.enqueue({ id, priority: 4, source: 'system', lang: services.lang, createdAt: performance.now(), parts });
  };
  const enrollment = new EnrollmentDialog({
    say: (key) => speak([{ kind: 'clip', key }]),
    speak,
    capture: () =>
      faces.captureFaces({ max: IDENTITY.enrollMaxFrames, durationMs: IDENTITY.enrollCaptureMs, minPx: IDENTITY.enrollMinPx }),
    store: identities,
    syncClips: () => void nameClips.sync(services.lang),
    deleteFiles,
    setEnrolling: (on) => (faces.suppressUnknown = on),
  });
  return Object.assign(services, {
    metrics,
    player,
    scheduler,
    connectivity,
    reflex,
    frames: new FrameGrabber(),
    identities,
    faces,
    nameClips,
    enrollment,
    lang: DEFAULT_LANG,
  });
}

/** Audio mode, clip preloading and connectivity. Returns a cleanup function. */
export async function startServices(s: Services): Promise<() => void> {
  await s.identities.init().catch((e) => console.warn('identity store failed', e)); // F3 then runs with nobody saved
  await ExpoAudioBackend.configure();
  await s.player.preloadPack(s.lang);
  s.connectivity.start();
  // Name clips deferred while offline (F4) are fetched when the relay is reachable again.
  const off = s.connectivity.onChange((online) => {
    if (online) void s.nameClips.sync(s.lang);
  });
  return () => {
    off();
    s.connectivity.stop();
  };
}
