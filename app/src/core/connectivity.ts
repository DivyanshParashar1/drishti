import NetInfo from '@react-native-community/netinfo';
import { authHeaders, SERVER_URL } from './config';

/**
 * online = the phone has a network AND our relay answers /health.
 *
 * - Network lost (netinfo) → offline at once, no ping needed.
 * - Network present → ping now, then every `intervalMs`. One success → online; two failures in a
 *   row → offline (one dropped ping is a blip, not an outage).
 * - `online` starts as null (unknown) so the app doesn't announce "internet back" at startup.
 */
export interface ConnectivityDeps {
  subscribeNet(cb: (connected: boolean) => void): () => void;
  ping(): Promise<boolean>;
}

export type ConnectivityListener = (online: boolean, previous: boolean | null) => void;

export const PING_INTERVAL_MS = 30_000;
export const FAILURES_TO_OFFLINE = 2;

export class ConnectivityMonitor {
  private state: boolean | null = null;
  private netConnected = false;
  private failures = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private listeners: ConnectivityListener[] = [];
  private pinging = false;

  constructor(
    private readonly deps: ConnectivityDeps,
    private readonly intervalMs = PING_INTERVAL_MS,
  ) {}

  get online(): boolean | null {
    return this.state;
  }

  start(): void {
    this.unsubscribe = this.deps.subscribeNet((connected) => this.onNet(connected));
    this.timer = setInterval(() => {
      if (this.netConnected) void this.check();
    }, this.intervalMs);
  }

  stop(): void {
    this.unsubscribe?.();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsubscribe = null;
  }

  onChange(cb: ConnectivityListener): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  /** Ping now (e.g. before an /ask) and return the result. */
  async check(): Promise<boolean | null> {
    if (!this.netConnected) {
      this.set(false);
      return false;
    }
    if (this.pinging) return this.state;
    this.pinging = true;
    try {
      const ok = await this.deps.ping();
      if (ok) {
        this.failures = 0;
        this.set(true);
      } else if (++this.failures >= FAILURES_TO_OFFLINE || this.state === null) {
        this.set(false);
      }
    } finally {
      this.pinging = false;
    }
    return this.state;
  }

  private onNet(connected: boolean) {
    this.netConnected = connected;
    if (!connected) {
      this.failures = 0;
      this.set(false);
    } else {
      void this.check();
    }
  }

  private set(v: boolean) {
    if (v === this.state) return;
    const prev = this.state;
    this.state = v;
    for (const l of this.listeners) l(v, prev);
  }
}

/** GET /health with a short timeout. */
export async function pingHealth(timeoutMs = 3000, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchFn(`${SERVER_URL}/health`, { headers: authHeaders(), signal: ctrl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export function createConnectivityMonitor(): ConnectivityMonitor {
  return new ConnectivityMonitor({
    subscribeNet: (cb) => NetInfo.addEventListener((s) => cb(Boolean(s.isConnected))),
    ping: () => pingHealth(),
  });
}
