import { ClipPlayer } from '../audio/clipPlayer';
import { ExpoAudioBackend } from '../audio/expoBackend';
import { SpeechScheduler } from '../audio/scheduler';
import { openDatabaseSync } from 'expo-sqlite';
import { FaceIdentifier } from '../identity/identifier';
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
  return Object.assign(services, {
    metrics,
    player,
    scheduler,
    connectivity: createConnectivityMonitor(),
    reflex,
    frames: new FrameGrabber(),
    identities,
    faces,
    lang: DEFAULT_LANG,
  });
}

/** Audio mode, clip preloading and connectivity. Returns a cleanup function. */
export async function startServices(s: Services): Promise<() => void> {
  await s.identities.init().catch((e) => console.warn('identity store failed', e)); // F3 then runs with nobody saved
  await ExpoAudioBackend.configure();
  await s.player.preloadPack(s.lang);
  s.connectivity.start();
  return () => s.connectivity.stop();
}
