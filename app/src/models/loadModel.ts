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

/** Load a model on the Android GPU delegate, falling back to CPU if the GPU delegate fails. */
export async function loadWithFallback(
  source: number,
  now: () => number = () => performance.now(),
): Promise<LoadedModel> {
  const start = now();
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
