import { ConnectivityMonitor, pingHealth } from '../connectivity';

jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn() }));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { serverUrl: 'http://srv:8000/', appToken: 'tok' } } }));

function setup(pings: boolean[]) {
  let netCb: (c: boolean) => void = () => {};
  const ping = jest.fn(async () => pings.shift() ?? true);
  const m = new ConnectivityMonitor({ subscribeNet: (cb) => ((netCb = cb), () => {}), ping }, 1000);
  const changes: [boolean, boolean | null][] = [];
  m.onChange((v, prev) => changes.push([v, prev]));
  m.start();
  return { m, ping, changes, net: (c: boolean) => netCb(c) };
}

const flush = () => new Promise<void>((r) => setImmediate(() => r()));

afterEach(() => jest.useRealTimers());

test('starts unknown, goes online after a successful ping', async () => {
  const { m, changes, net } = setup([true]);
  expect(m.online).toBeNull();
  net(true);
  await flush();
  expect(m.online).toBe(true);
  expect(changes).toEqual([[true, null]]);
  m.stop();
});

test('network loss is offline at once, without a ping', async () => {
  const { m, ping, changes, net } = setup([true]);
  net(true);
  await flush();
  ping.mockClear();
  net(false);
  expect(m.online).toBe(false);
  expect(ping).not.toHaveBeenCalled();
  expect(changes.at(-1)).toEqual([false, true]);
  m.stop();
});

test('one failed ping is a blip; two in a row is offline', async () => {
  const { m, net } = setup([true, false, false]);
  net(true);
  await flush();
  await m.check();
  expect(m.online).toBe(true);
  await m.check();
  expect(m.online).toBe(false);
  m.stop();
});

test('first ping failing from unknown reports offline', async () => {
  const { m, net } = setup([false]);
  net(true);
  await flush();
  expect(m.online).toBe(false);
  m.stop();
});

test('pings periodically while the network is up', async () => {
  jest.useFakeTimers();
  const { m, ping, net } = setup([]);
  net(true);
  await Promise.resolve();
  expect(ping).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(3000);
  expect(ping).toHaveBeenCalledTimes(4);
  net(false);
  await jest.advanceTimersByTimeAsync(3000);
  expect(ping).toHaveBeenCalledTimes(4);
  m.stop();
});

test('listeners fire only on change', async () => {
  const { m, changes, net } = setup([true, true, true]);
  net(true);
  await flush();
  await m.check();
  await m.check();
  expect(changes).toHaveLength(1);
  m.stop();
});

test('pingHealth hits /health with the token and treats errors as offline', async () => {
  const ok = jest.fn(async () => ({ ok: true }) as Response);
  expect(await pingHealth(1000, ok as never)).toBe(true);
  expect(ok).toHaveBeenCalledWith('http://srv:8000/health', expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }));
  expect(await pingHealth(1000, (async () => ({ ok: false })) as never)).toBe(false);
  expect(await pingHealth(1000, (async () => { throw new Error('ECONNREFUSED'); }) as never)).toBe(false);
});
