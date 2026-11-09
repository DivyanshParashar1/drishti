// Bundled detector models. Both stay wired; config picks one after the device benchmark (PLAN DT-6.1).
export type DetectorId = 'efficientdet_lite0' | 'yolo11n';

export const DETECTOR_ASSETS: Record<DetectorId, number> = {
  efficientdet_lite0: require('../../assets/models/efficientdet_lite0.tflite'),
  yolo11n: require('../../assets/models/yolo11n_float32.tflite'),
};

// Face embedder (F3): MobileFaceNet, Qualcomm AI Hub TFLite float (README, Model licences).
export const FACE_EMBEDDER_ASSET: number = require('../../assets/models/mobilefacenet.tflite');

// P17 wake word: openWakeWord v0.5.1 feature models (Apache-2.0; melspectrogram pinned to a fixed
// 1760-sample input by scripts/wake/fix_melspec_shape.py) and the wake-word model. "Hey Jarvis"
// (openWakeWord's pre-trained model, CC BY-NC-SA 4.0, testing only) until a "Drishti" model is
// trained (README → Wake word): drop drishti.tflite into assets/models/wake/ and switch these two lines.
export const WAKE_FEATURE_ASSETS = {
  melspec: require('../../assets/models/wake/melspectrogram_1760.tflite') as number,
  embedding: require('../../assets/models/wake/embedding_model.tflite') as number,
};
export const WAKE_WORD_ASSET: number = require('../../assets/models/wake/hey_jarvis_v0.1.tflite');
export const WAKE_PHRASE = 'Hey Jarvis';
