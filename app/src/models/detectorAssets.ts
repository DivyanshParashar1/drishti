// Bundled detector models. Both stay wired; config picks one after the device benchmark (PLAN DT-6.1).
export type DetectorId = 'efficientdet_lite0' | 'yolo11n';

export const DETECTOR_ASSETS: Record<DetectorId, number> = {
  efficientdet_lite0: require('../../assets/models/efficientdet_lite0.tflite'),
  yolo11n: require('../../assets/models/yolo11n_float32.tflite'),
};

// Face embedder (F3): MobileFaceNet, Qualcomm AI Hub TFLite float (README, Model licences).
export const FACE_EMBEDDER_ASSET: number = require('../../assets/models/mobilefacenet.tflite');
