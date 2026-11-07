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
import { Reader } from '../reading/reader';
import { File, Paths } from 'expo-file-system';
import { IdentityStore, type SqlDb } from '../identity/store';
import { ReflexLane } from '../vision/reflexLane';
import { createConnectivityMonitor, type ConnectivityMonitor } from './connectivity';
import { FrameGrabber } from './frameGrabber';
import { DEFAULT_LANG, type Lang } from './lang';
import { ConnectivityAnnouncer } from './announcer';
import { playFirstRun, TUTORIAL } from './firstRun';
import { applyLanguage } from './language';
import { Metrics } from './metrics';
import { SettingsStore } from './settings';

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
  reader: Reader;
  settings: SettingsStore;
  lang: Lang;
  /** F10: queue the welcome + tutorial lines (P4, one utterance per line). */
  tutorial(): void;
  /** F8: switch language everywhere and persist it. */
  setLanguage(lang: Lang): Promise<void>;
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
  const db = openDatabaseSync('drishti.db') as unknown as SqlDb;
  const identities = new IdentityStore(db);
  const settings = new SettingsStore(db);
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
      faces.captureFaces({ max: IDENTITY.enrollMaxFrames, durationMs: IDENTITY.enrollCaptureMs, minPx: IDENTITY.enrollMinPx, minGapMs: IDENTITY.enrollGapMs }),
    store: identities,
    syncClips: () => void nameClips.sync(services.lang),
    deleteFiles,
    setEnrolling: (on) => (faces.suppressUnknown = on),
  });
  let readN = 0;
  const reader = new Reader({
    scheduler,
    metrics,
    lang: () => services.lang,
    online: () => connectivity.online,
    tts: fetchTts,
    writeAudio: async (mp3) => {
      const f = new File(Paths.cache, `read-${readN++ % 6}.mp3`); // current + prefetched, with margin
      await f.write(new Uint8Array(mp3));
      return f.uri;
    },
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
    reader,
    settings,
    lang: DEFAULT_LANG,
    tutorial: () => {
      for (const key of TUTORIAL) speak([{ kind: 'clip', key }]);
    },
    setLanguage: (lang: Lang) => applyLanguage({ holder: services, reflex, player, settings, nameClips }, lang),
  });
}

/** Audio mode, clip preloading and connectivity. Returns a cleanup function. */
export async function startServices(s: Services): Promise<() => void> {
  await s.identities.init().catch((e) => console.warn('identity store failed', e)); // F3 then runs with nobody saved
  await s.settings.init().catch((e) => console.warn('settings failed', e)); // defaults then
  s.lang = s.settings.lang ?? DEFAULT_LANG;
  s.reflex.lang = s.lang;
  await ExpoAudioBackend.configure();
  await s.player.preloadPack(s.lang);
  void playFirstRun(s.settings, () => s.tutorial()); // F10: once ever; "help" replays it
  // F10: "Internet chala gaya, alerts chalu hain" / "Internet wapas aa gaya", without flapping spam.
  const announcer = new ConnectivityAnnouncer((key) => {
    const id = s.metrics.start('system', 'enqueued');
    s.metrics.note(id, key === 'sys.internet_lost' ? 'internet_lost' : 'internet_back');
    s.scheduler.enqueue({ id, priority: 2, source: 'system', lang: s.lang, createdAt: performance.now(), parts: [{ kind: 'clip', key }] });
  });
  const off = s.connectivity.onChange((online) => {
    announcer.onChange(online);
    if (online) void s.nameClips.sync(s.lang); // name clips deferred while offline (F4)
  });
  s.connectivity.start();
  return () => {
    off();
    announcer.dispose();
    s.connectivity.stop();
  };
}
