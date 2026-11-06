import { ClipPlayer } from '../audio/clipPlayer';
import { ExpoAudioBackend } from '../audio/expoBackend';
import { SpeechScheduler } from '../audio/scheduler';
import { createConnectivityMonitor, type ConnectivityMonitor } from './connectivity';
import { DEFAULT_LANG, type Lang } from './lang';
import { Metrics } from './metrics';

/** The app's long-lived singletons, created once at startup. */
export interface Services {
  metrics: Metrics;
  player: ClipPlayer;
  scheduler: SpeechScheduler;
  connectivity: ConnectivityMonitor;
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
  return { metrics, player, scheduler, connectivity: createConnectivityMonitor(), lang: DEFAULT_LANG };
}

/** Audio mode, clip preloading and connectivity. Returns a cleanup function. */
export async function startServices(s: Services): Promise<() => void> {
  await ExpoAudioBackend.configure();
  await s.player.preloadPack(s.lang);
  s.connectivity.start();
  return () => s.connectivity.stop();
}
