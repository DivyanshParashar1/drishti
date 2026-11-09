import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TfliteModel } from 'react-native-fast-tflite';
import { NitroModules } from 'react-native-nitro-modules';
import { HybridFrameConverter, useFrameOutput, type Frame } from 'react-native-vision-camera';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';
import { IDENTITY } from '../identity/config';
import type { FaceObs } from '../identity/identifier';
import { DETECTOR_ASSETS, FACE_EMBEDDER_ASSET } from '../models/detectorAssets';
import { loadWithFallback } from '../models/loadModel';
import { VISION, type DetectorId } from './config';
import { decodeEfficientDet, decodeYolo } from './decode';
import { embedFaces, type MlFace } from './faceWorklet';
import { letterbox, meanLuma, toInputTensor, toLetterboxTensor, unletterbox } from './preprocess';
import type { FrameResult } from './reflexLane';

export type ModelState =
  | { state: 'loading'; detector: DetectorId }
  | { state: 'ready'; detector: DetectorId; delegate: string; loadMs: number }
  | { state: 'failed'; detector: DetectorId; error: string };

export type FaceStatus =
  | { state: 'loading' }
  | { state: 'ready'; delegate: string; loadMs: number }
  | { state: 'failed'; error: string };

interface FaceDetectorLike {
  detectFaces(frame: Frame): MlFace[];
}

/** ML Kit face detector (F3), or the error if the native module isn't there. Never throws. */
function createMlKitFaceDetector(): { detector: FaceDetectorLike | null; error: string | null } {
  try {
    // Required lazily: the package creates its native factory at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createFaceDetector } = require('react-native-vision-camera-face-detector');
    const detector = createFaceDetector({
      performanceMode: 'fast',
      runLandmarks: true,
      minFaceSize: IDENTITY.mlkitMinFaceSize,
    }) as FaceDetectorLike;
    return { detector, error: null };
  } catch (e) {
    return { detector: null, error: String(e) };
  }
}

/**
 * Loads the configured detector and returns a VisionCamera v5 frame output that runs it on every
 * Nth frame: Frame → nitro Image → resize to 320×320 → raw pixels → input tensor → runSync →
 * decode. When a person is detected and faces are on, ML Kit finds faces on the same frame and
 * the largest two ≥ 80 px are embedded (F3). Results go to `onResult` on the JS thread. Frames
 * arrive upright (enablePhysicalBufferRotation), so boxes are in portrait coordinates.
 */
export const GRAB_MAX_SIDE = 512; // /ask frames: longest side ≤ 512 px (F6)
export type GrabMode = 'ask' | 'full'; // full: OCR (F7), no resize, quality 90
const GRAB_TIMEOUT_MS = 1000;
const FACE_CFG = { minFacePx: IDENTITY.minFacePx, maxFacesPerFrame: IDENTITY.maxFacesPerFrame, cropScale: IDENTITY.cropScale };

export function useReflexCamera(
  onResult: (r: FrameResult) => void,
  onError: (message: string) => void,
  detector: DetectorId = VISION.detector,
  facesOn = true,
) {
  // Results are keyed by detector, so switching detectors reads as "loading" until the new one lands.
  const [loaded, setLoaded] = useState<{ detector: DetectorId; model: TfliteModel | null; status: ModelState } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadWithFallback(DETECTOR_ASSETS[detector], undefined, VISION.delegate)
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

  // Face embedder and ML Kit face detector: loaded once, independent of the object detector.
  const [embedder, setEmbedder] = useState<{ model: TfliteModel | null; status: FaceStatus }>({
    model: null,
    status: { state: 'loading' },
  });
  useEffect(() => {
    let cancelled = false;
    loadWithFallback(FACE_EMBEDDER_ASSET, undefined, VISION.delegate)
      .then(({ model: m, delegate, loadMs }) => !cancelled && setEmbedder({ model: m, status: { state: 'ready', delegate, loadMs } }))
      .catch((e) => !cancelled && setEmbedder({ model: null, status: { state: 'failed', error: String(e) } }));
    return () => {
      cancelled = true;
    };
  }, []);
  const mlkit = useMemo(() => createMlKitFaceDetector(), []);
  const faceStatus: FaceStatus = mlkit.error ? { state: 'failed', error: `ML Kit: ${mlkit.error}` } : embedder.status;
  const boxedEmbedder = useMemo(() => (embedder.model ? NitroModules.box(embedder.model) : null), [embedder.model]);
  const boxedFaces = useMemo(
    () => (mlkit.detector ? NitroModules.box(mlkit.detector as unknown as Parameters<typeof NitroModules.box>[0]) : null),
    [mlkit.detector],
  );
  const facesEnabled = useMemo(() => createSynchronizable(facesOn), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => facesEnabled.setBlocking(facesOn), [facesEnabled, facesOn]);

  const current = loaded?.detector === detector ? loaded : null;
  const model = current?.model ?? null;
  const status: ModelState = current?.status ?? { state: 'loading', detector };

  // HybridObjects are boxed for capture and unboxed inside the worklet (fast-tflite README).
  const boxedModel = useMemo(() => (model ? NitroModules.box(model) : null), [model]);
  const boxedConverter = useMemo(() => NitroModules.box(HybridFrameConverter), []);
  const counter = useMemo(() => createSynchronizable(0), []);
  const grabRequested = useMemo(() => createSynchronizable(0), []); // 0 none, 1 ask, 2 full
  const grabWaiter = useRef<((jpeg: ArrayBuffer | null) => void) | null>(null);
  const onGrab = useCallback((jpeg: ArrayBuffer | null) => {
    grabWaiter.current?.(jpeg);
    grabWaiter.current = null;
  }, []);

  /** The next camera frame as a JPEG ('ask': quality 70, longest side 512; 'full': quality 90), or null after 1 s. */
  const grab = useCallback(
    (mode: GrabMode = 'ask') =>
      new Promise<ArrayBuffer | null>((resolve) => {
        grabWaiter.current?.(null);
        const timer = setTimeout(() => {
          grabWaiter.current = null;
          grabRequested.setBlocking(0);
          resolve(null);
        }, GRAB_TIMEOUT_MS);
        grabWaiter.current = (jpeg) => {
          clearTimeout(timer);
          resolve(jpeg);
        };
        grabRequested.setBlocking(mode === 'full' ? 2 : 1);
      }),
    [grabRequested],
  );
  const size = VISION.inputSize;
  const every = VISION.everyNthFrame;
  const minScore = VISION.decodeScore; // the lane filters at VISION.minScore before announcing
  const yoloIou = VISION.yoloIou;
  const faceCfg = FACE_CFG;

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      const n = counter.getDirty();
      counter.setBlocking(n + 1);
      const grabMode = grabRequested.getDirty();
      if (grabMode !== 0) {
        grabRequested.setBlocking(0);
        try {
          const full = boxedConverter.unbox().convertFrameToImage(frame);
          if (grabMode === 2) {
            scheduleOnRN(onGrab, full.toEncodedImageData('jpg', 90).buffer);
          } else {
            const k = GRAB_MAX_SIDE / Math.max(full.width, full.height);
            const w = Math.round(full.width * Math.min(1, k));
            const h = Math.round(full.height * Math.min(1, k));
            scheduleOnRN(onGrab, full.resize(w, h).toEncodedImageData('jpg', 70).buffer);
          }
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
        // YOLO: letterbox (keep aspect, grey bars) like its training; EfficientDet: stretch to square.
        const lb = detector === 'yolo11n' ? letterbox(image.width, image.height, size) : null;
        const raw = lb ? image.resize(lb.w, lb.h).toRawPixelData() : image.resize(size, size).toRawPixelData();
        const pixels = new Uint8Array(raw.buffer);
        const luma = lb ? meanLuma(pixels, raw.pixelFormat, lb.w, lb.h) : meanLuma(pixels, raw.pixelFormat, size); // F10
        const input = lb ? toLetterboxTensor(pixels, raw.pixelFormat, lb) : toInputTensor(pixels, raw.pixelFormat, size, detector);
        const t1 = now();
        const outs = boxedModel.unbox().runSync([input]);
        const t2 = now();
        const views = outs.map((b) => new Float32Array(b));
        let detections =
          detector === 'efficientdet_lite0'
            ? decodeEfficientDet(views, minScore)
            : decodeYolo(views[0], views[0].length / 84, minScore, yoloIou, 20);
        if (lb) detections = detections.map((d) => ({ label: d.label, score: d.score, box: unletterbox(d.box, lb) }));
        const t3 = now();
        // F3: faces only when a person is in view; ML Kit reads the (YUV) frame itself.
        let faces: FaceObs[] = [];
        let faceMs = -1;
        if (boxedFaces !== null && facesEnabled.getDirty() && detections.some((d) => d.label === 'person')) {
          const found = (boxedFaces.unbox() as unknown as FaceDetectorLike).detectFaces(frame);
          faces = embedFaces(found, image, boxedEmbedder ? boxedEmbedder.unbox() : null, faceCfg);
          faceMs = now() - t3;
        }
        frame.dispose();
        disposed = true;
        scheduleOnRN(onResult, {
          frameNo: n,
          detections,
          faces,
          luma,
          frameWidth: image.width,
          frameHeight: image.height,
          preprocessMs: t1 - t0,
          inferMs: t2 - t1,
          faceMs,
          totalMs: now() - t0,
        });
      } catch (e) {
        if (!disposed) frame.dispose();
        scheduleOnRN(onError, String(e));
      }
    },
    [
      boxedModel,
      boxedConverter,
      boxedFaces,
      boxedEmbedder,
      facesEnabled,
      counter,
      grabRequested,
      detector,
      every,
      size,
      minScore,
      yoloIou,
      faceCfg,
      onResult,
      onError,
      onGrab,
    ],
  );

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    targetResolution: VISION.frameResolution,
    enablePhysicalBufferRotation: true,
    dropFramesWhileBusy: true,
    onFrame,
  });

  return { frameOutput, status, faceStatus, grab };
}
