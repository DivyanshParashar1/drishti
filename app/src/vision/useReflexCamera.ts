import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TfliteModel } from 'react-native-fast-tflite';
import { NitroModules } from 'react-native-nitro-modules';
import { HybridFrameConverter, useFrameOutput, type Frame } from 'react-native-vision-camera';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';
import { DETECTOR_ASSETS } from '../models/detectorAssets';
import { loadWithFallback } from '../models/loadModel';
import { VISION, type DetectorId } from './config';
import { decodeEfficientDet, decodeYolo } from './decode';
import { YOLO_ALERT_MASK } from './labels';
import { toInputTensor } from './preprocess';
import type { FrameResult } from './reflexLane';

export type ModelState =
  | { state: 'loading'; detector: DetectorId }
  | { state: 'ready'; detector: DetectorId; delegate: string; loadMs: number }
  | { state: 'failed'; detector: DetectorId; error: string };

/**
 * Loads the configured detector and returns a VisionCamera v5 frame output that runs it on every
 * Nth frame: Frame → nitro Image → resize to 320×320 → raw pixels → input tensor → runSync →
 * decode. Results go to `onResult` on the JS thread. Frames arrive upright
 * (enablePhysicalBufferRotation), so boxes are in portrait coordinates.
 */
export function useReflexCamera(
  onResult: (r: FrameResult) => void,
  onError: (message: string) => void,
  detector: DetectorId = VISION.detector,
) {
  // Results are keyed by detector, so switching detectors reads as "loading" until the new one lands.
  const [loaded, setLoaded] = useState<{ detector: DetectorId; model: TfliteModel | null; status: ModelState } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadWithFallback(DETECTOR_ASSETS[detector])
      .then(({ model: m, delegate, loadMs }) => {
        if (!cancelled) setLoaded({ detector, model: m, status: { state: 'ready', detector, delegate, loadMs } });
      })
      .catch((e) => {
        if (!cancelled) setLoaded({ detector, model: null, status: { state: 'failed', detector, error: String(e) } });
      });
    return () => {
      cancelled = true;
    };
  }, [detector]);

  const current = loaded?.detector === detector ? loaded : null;
  const model = current?.model ?? null;
  const status: ModelState = current?.status ?? { state: 'loading', detector };

  // HybridObjects are boxed for capture and unboxed inside the worklet (fast-tflite README).
  const boxedModel = useMemo(() => (model ? NitroModules.box(model) : null), [model]);
  const boxedConverter = useMemo(() => NitroModules.box(HybridFrameConverter), []);
  const counter = useMemo(() => createSynchronizable(0), []);
  const size = VISION.inputSize;
  const every = VISION.everyNthFrame;
  const minScore = VISION.minScore;
  const yoloIou = VISION.yoloIou;
  const mask = YOLO_ALERT_MASK;

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      const n = counter.getDirty();
      counter.setBlocking(n + 1);
      if (boxedModel === null || n % every !== 0) {
        frame.dispose();
        return;
      }
      const now = () => (globalThis.performance ? globalThis.performance.now() : Date.now());
      const t0 = now();
      let disposed = false;
      try {
        const image = boxedConverter.unbox().convertFrameToImage(frame);
        frame.dispose();
        disposed = true;
        const raw = image.resize(size, size).toRawPixelData();
        const input = toInputTensor(new Uint8Array(raw.buffer), raw.pixelFormat, size, detector);
        const t1 = now();
        const outs = boxedModel.unbox().runSync([input]);
        const t2 = now();
        const views = outs.map((b) => new Float32Array(b));
        const detections =
          detector === 'efficientdet_lite0'
            ? decodeEfficientDet(views, minScore)
            : decodeYolo(views[0], views[0].length / 84, minScore, yoloIou, 20, mask);
        const t3 = now();
        scheduleOnRN(onResult, {
          frameNo: n,
          detections,
          frameWidth: image.width,
          frameHeight: image.height,
          preprocessMs: t1 - t0,
          inferMs: t2 - t1,
          totalMs: t3 - t0,
        });
      } catch (e) {
        if (!disposed) frame.dispose();
        scheduleOnRN(onError, String(e));
      }
    },
    [boxedModel, boxedConverter, counter, detector, every, size, minScore, yoloIou, mask, onResult, onError],
  );

  const frameOutput = useFrameOutput({
    pixelFormat: 'rgb',
    targetResolution: { width: 640, height: 480 },
    enablePhysicalBufferRotation: true,
    dropFramesWhileBusy: true,
    onFrame,
  });

  return { frameOutput, status };
}
