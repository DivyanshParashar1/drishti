import {
  loadTensorflowModel,
  type TensorflowModelDelegate,
  type TfliteModel,
} from 'react-native-fast-tflite';
import { Asset } from 'expo-asset';

/**
 * Load a bundled `.tflite` (a `require(...)` id) with the given delegates. fast-tflite 3 reads the
 * model with `java.net.URL`, which works in dev (Metro serves an http URL) but not in release, where
 * the asset resolves to a bare Android resource name ("no protocol"). expo-asset copies the resource
 * into the cache and gives a file:// URI that URL can read in both.
 */
export async function loadBundledModel(source: number, delegates: TensorflowModelDelegate[]): Promise<TfliteModel> {
  const asset = await Asset.fromModule(source).downloadAsync();
  const url = asset.localUri ?? asset.uri;
  return loadTensorflowModel({ url }, delegates);
}

export interface LoadedModel {
  model: TfliteModel;
  delegate: TensorflowModelDelegate | 'cpu';
  loadMs: number;
}

/**
 * Load a model. 'gpu': the Android GPU delegate, falling back to CPU if it fails. 'cpu': CPU only
 * (TFLite's default CPU path with XNNPACK).
 */
export async function loadWithFallback(
  source: number,
  now: () => number = () => performance.now(),
  prefer: 'gpu' | 'cpu' = 'gpu',
): Promise<LoadedModel> {
  const start = now();
  if (prefer === 'cpu') {
    const model = await loadBundledModel(source, []);
    return { model, delegate: 'cpu', loadMs: now() - start };
  }
  try {
    const model = await loadBundledModel(source, ['android-gpu']);
    return { model, delegate: 'android-gpu', loadMs: now() - start };
  } catch {
    const model = await loadBundledModel(source, []);
    return { model, delegate: 'cpu', loadMs: now() - start };
  }
}

export function describeTensors(model: TfliteModel): string {
  const fmt = (t: { name: string; dataType: string; shape: number[] }) =>
    `${t.name} ${t.dataType}[${t.shape.join('x')}]`;
  return `in: ${model.inputs.map(fmt).join(', ')} | out: ${model.outputs.map(fmt).join(', ')}`;
}
