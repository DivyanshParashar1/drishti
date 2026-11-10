import { loadTensorflowModel } from 'react-native-fast-tflite';
import { describeTensors, loadWithFallback } from '../loadModel';

jest.mock('react-native-fast-tflite', () => ({ loadTensorflowModel: jest.fn() }));
jest.mock('expo-asset', () => ({
  Asset: { fromModule: (id: number) => ({ downloadAsync: async () => ({ localUri: `file:///cache/${id}.tflite`, uri: 'raw' }) }) },
}));
const url = (id: number) => ({ url: `file:///cache/${id}.tflite` });
const load = loadTensorflowModel as jest.Mock;

const fakeModel = {
  inputs: [{ name: 'images', dataType: 'uint8', shape: [1, 320, 320, 3] }],
  outputs: [{ name: 'boxes', dataType: 'float32', shape: [1, 25, 4] }],
};

beforeEach(() => load.mockReset());

test('uses the GPU delegate when it loads', async () => {
  load.mockResolvedValueOnce(fakeModel);
  const r = await loadWithFallback(1);
  expect(r.delegate).toBe('android-gpu');
  expect(load).toHaveBeenCalledWith(url(1), ['android-gpu']);
});

test('falls back to CPU when the GPU delegate fails', async () => {
  load.mockRejectedValueOnce(new Error('no gpu')).mockResolvedValueOnce(fakeModel);
  const r = await loadWithFallback(1);
  expect(r.delegate).toBe('cpu');
  expect(load).toHaveBeenLastCalledWith(url(1), []);
});

test('propagates the error when CPU also fails', async () => {
  load.mockRejectedValue(new Error('bad model'));
  await expect(loadWithFallback(1)).rejects.toThrow('bad model');
});

test('describes tensor shapes', () => {
  expect(describeTensors(fakeModel as never)).toBe(
    'in: images uint8[1x320x320x3] | out: boxes float32[1x25x4]',
  );
});

test('cpu preference never tries the GPU delegate', async () => {
  load.mockResolvedValueOnce(fakeModel);
  const r = await loadWithFallback(1, () => 0, 'cpu');
  expect(r.delegate).toBe('cpu');
  expect(load).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledWith(url(1), []);
});
