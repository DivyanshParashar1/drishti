import { ClipPlayer } from '../audio/clipPlayer';
import { PhraseCache } from '../audio/phraseCache';
import { listPhrases, writePhrase } from '../audio/phraseFiles';
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
import type { ClipKey } from '../audio/clips.generated';
import { Signal } from './signal';
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
  phrases: PhraseCache;
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
  /** F12: fired after a language switch has been applied. */
  langChanged: Signal<[Lang]>;
  /** F12: the demo UI (default) or real-user mode (plain black screen). Saved. */
  demoMode: boolean;
  /** Switch demo mode, save it and say so ("Demo mode chalu ho gaya"). */
  setDemoMode(on: boolean): void;
  /** F12: fired when demo mode changes (also once when the saved setting loads). */
  demoChanged: Signal<[on: boolean, byUser: boolean]>;
  /** True when this session played the first-run tutorial (F12 caption says "First run"). */
  firstRun: boolean;
  /** A fixed phrase as a P4 system line. */
  say(key: ClipKey): void;
}

export function createServices(): Services {
  const metrics = new Metrics();
  const connectivity = createConnectivityMonitor();
  // Fixed phrases in Gnani Timbre's voice: fetched once per language when online, then played
  // from files (offline too). expo-speech only until a phrase is saved.
  const phrases = new PhraseCache({ tts: fetchTts, write: writePhrase, list: listPhrases, online: () => connectivity.online });
  const player = new ClipPlayer(new ExpoAudioBackend(), (lang, key) => phrases.uri(lang, key));
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
    phrases,
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
    setLanguage: async (lang: Lang) => {
      await applyLanguage({ holder: services, reflex, player, settings, nameClips, phrases }, lang);
      services.langChanged.emit(lang);
    },
    langChanged: new Signal<[Lang]>(),
    demoMode: true,
    setDemoMode: (on: boolean) => {
      services.demoMode = on;
      void settings.setDemoMode(on).catch(() => undefined);
      speak([{ kind: 'clip', key: on ? 'sys.demo_on' : 'sys.demo_off' }]);
      services.demoChanged.emit(on, true);
    },
    demoChanged: new Signal<[boolean, boolean]>(),
    firstRun: false,
    say: (key: ClipKey) => speak([{ kind: 'clip', key }]),
  });
}

/** Audio mode, clip preloading and connectivity. Returns a cleanup function. */
export async function startServices(s: Services): Promise<() => void> {
  await s.identities.init().catch((e) => console.warn('identity store failed', e)); // F3 then runs with nobody saved
  await s.settings.init().catch((e) => console.warn('settings failed', e)); // defaults then
  s.lang = s.settings.lang ?? DEFAULT_LANG;
  s.reflex.lang = s.lang;
  s.langChanged.emit(s.lang);
  s.demoMode = s.settings.demoMode;
  s.demoChanged.emit(s.demoMode, false);
  await s.phrases.load(s.lang); // Timbre phrases saved on earlier runs
  await ExpoAudioBackend.configure();
  await s.player.preloadPack(s.lang);
  s.firstRun = !s.settings.firstRunDone;
  void playFirstRun(s.settings, () => s.tutorial()); // F10: once ever; "help" replays it
  // F10: "Internet chala gaya, alerts chalu hain" / "Internet wapas aa gaya", without flapping spam.
  const announcer = new ConnectivityAnnouncer((key) => {
    const id = s.metrics.start('system', 'enqueued');
    s.metrics.note(id, key === 'sys.internet_lost' ? 'internet_lost' : 'internet_back');
    s.scheduler.enqueue({ id, priority: 2, source: 'system', lang: s.lang, createdAt: performance.now(), parts: [{ kind: 'clip', key }] });
  });
  const off = s.connectivity.onChange((online) => {
    announcer.onChange(online);
    if (online) {
      void s.phrases.sync(s.lang); // fixed phrases in Timbre's voice
      void s.nameClips.sync(s.lang); // name clips deferred while offline (F4)
    }
  });
  s.connectivity.start();
  return () => {
    off();
    announcer.dispose();
    s.connectivity.stop();
  };
}
