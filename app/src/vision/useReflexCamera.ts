import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
export const GRAB_MAX_SIDE = 512; // /ask frames: longest side ≤ 512 px (F6)
const GRAB_TIMEOUT_MS = 1000;

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
  const grabRequested = useMemo(() => createSynchronizable(false), []);
  const grabWaiter = useRef<((jpeg: ArrayBuffer | null) => void) | null>(null);
  const onGrab = useCallback((jpeg: ArrayBuffer | null) => {
    grabWaiter.current?.(jpeg);
    grabWaiter.current = null;
  }, []);

  /** The next camera frame as a JPEG (quality 70, longest side 512), or null after 1 s. */
  const grab = useCallback(
    () =>
      new Promise<ArrayBuffer | null>((resolve) => {
        grabWaiter.current?.(null);
        const timer = setTimeout(() => {
          grabWaiter.current = null;
          grabRequested.setBlocking(false);
          resolve(null);
        }, GRAB_TIMEOUT_MS);
        grabWaiter.current = (jpeg) => {
          clearTimeout(timer);
          resolve(jpeg);
        };
        grabRequested.setBlocking(true);
      }),
    [grabRequested],
  );
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
      if (grabRequested.getDirty()) {
        grabRequested.setBlocking(false);
        try {
          const full = boxedConverter.unbox().convertFrameToImage(frame);
          const k = GRAB_MAX_SIDE / Math.max(full.width, full.height);
          const w = Math.round(full.width * Math.min(1, k));
          const h = Math.round(full.height * Math.min(1, k));
          scheduleOnRN(onGrab, full.resize(w, h).toEncodedImageData('jpg', 70).buffer);
        } catch {
          scheduleOnRN(onGrab, null);
        }
      }
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
    [boxedModel, boxedConverter, counter, grabRequested, detector, every, size, minScore, yoloIou, mask, onResult, onError, onGrab],
  );

  const frameOutput = useFrameOutput({
    pixelFormat: 'rgb',
    targetResolution: { width: 640, height: 480 },
    enablePhysicalBufferRotation: true,
    dropFramesWhileBusy: true,
    onFrame,
  });

  return { frameOutput, status, grab };
}
