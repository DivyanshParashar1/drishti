import { RecorderFrameSource, type PcmRecorder } from '../recorderSource';

function setup(fail?: string) {
  let onPcm: ((b: Uint8Array) => void) | null = null;
  const log: string[] = [];
  const rec: PcmRecorder = {
    start: async (cb) => {
      if (fail) throw new Error(fail);
      onPcm = cb;
      log.push('start');
    },
    stop: async () => void log.push('stop'),
  };
  const src = new RecorderFrameSource(rec);
  const frames: number[][] = [];
  src.addFrameListener((f) => frames.push(f));
  const send = (samples: number[]) => {
    const b = new Uint8Array(samples.length * 2);
    const v = new DataView(b.buffer);
    samples.forEach((s, i) => v.setInt16(i * 2, s, true));
    onPcm!(b);
  };
  return { src, frames, send, log };
}

test('uneven recorder chunks become whole frames, in order', async () => {
  const t = setup();
  await t.src.start(4, 16000);
  t.send([1, 2, 3]);
  expect(t.frames).toEqual([]);
  t.send([4, -5, 6, 7, 8, 9, 10]);
  expect(t.frames).toEqual([
    [1, 2, 3, 4],
    [-5, 6, 7, 8],
  ]);
  t.send([11, 12]);
  expect(t.frames[2]).toEqual([9, 10, 11, 12]);
  await t.src.stop();
  expect(t.log).toEqual(['start', 'stop']);
});

test('a recorder that fails to start reports the error and throws', async () => {
  const t = setup('mic busy');
  const errors: string[] = [];
  t.src.addErrorListener((e) => errors.push(e.message));
  await expect(t.src.start(640, 16000)).rejects.toThrow('mic busy');
  expect(errors).toEqual(['mic busy']);
  await expect(t.src.start(640, 44100)).rejects.toThrow('16 kHz');
});
