/** Reflex-lane tunables (spec F1/F2). Tune on device: DT-6.1 (detector), DT-6.4 (near/far). */
export type DetectorId = 'efficientdet_lite0' | 'yolo11n';

export const VISION = {
  detector: 'efficientdet_lite0' as DetectorId, // default until DT-6.1 picks one
  inputSize: 320,
  // Camera frames (sensor orientation, landscape). P8: 1280×720 (720 px wide upright) so a face
  // reaches F3's 80 px at about 1.2 m; 640×480 only got there at ~0.8 m. YUV so ML Kit can read
  // the frame directly; the RGB conversion for the detector still works (CameraX toBitmap).
  frameResolution: { width: 1280, height: 720 },
  everyNthFrame: 2, // run the detector on every 2nd frame (F1: 2nd–3rd)
  minScore: 0.5,
  minArea: 0.03, // ignore boxes smaller than 3% of the frame
  nearHeight: 0.45, // near if box height > 45% of the frame…
  nearBottom: 0.85, // …or its bottom edge is in the lowest 15%
  directionHysteresis: 0.04, // a tracked object must cross a third-line by this much to switch
  trackIou: 0.3,
  trackTtlMs: 3000, // absent longer than this → forgotten; coming back is a new alert
  classCooldownMs: 4000,
  yoloIou: 0.45,
};
export type VisionConfig = typeof VISION;
