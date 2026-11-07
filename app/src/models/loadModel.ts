import {
  loadTensorflowModel,
  type TensorflowModelDelegate,
  type TfliteModel,
} from 'react-native-fast-tflite';

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
    const model = await loadTensorflowModel(source, []);
    return { model, delegate: 'cpu', loadMs: now() - start };
  }
  try {
    const model = await loadTensorflowModel(source, ['android-gpu']);
    return { model, delegate: 'android-gpu', loadMs: now() - start };
  } catch {
    const model = await loadTensorflowModel(source, []);
    return { model, delegate: 'cpu', loadMs: now() - start };
  }
}

export function describeTensors(model: TfliteModel): string {
  const fmt = (t: { name: string; dataType: string; shape: number[] }) =>
    `${t.name} ${t.dataType}[${t.shape.join('x')}]`;
  return `in: ${model.inputs.map(fmt).join(', ')} | out: ${model.outputs.map(fmt).join(', ')}`;
}
