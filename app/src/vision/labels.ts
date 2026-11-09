import type { ClipKey } from '../audio/clips.generated';

// Label maps embedded in the two models (read from their metadata, P6).
// EfficientDet-Lite0 uses the 90-id COCO map ('???' = unused ids); YOLO11n the 80-class map.

export const EFFDET_LABELS: readonly string[] = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light", "fire hydrant", "???", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "???", "backpack", "umbrella", "???", "???", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle", "???", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed", "???", "dining table", "???", "???", "toilet", "???", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "???", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"];

export const YOLO_LABELS: readonly string[] = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"];

/**
 * Every YOLO class is announced (P17: simple object detection, no fixed hazard list). Each label
 * maps to its clip key, spaces → underscores ("dining table" → obj.dining_table).
 */
export const ALERT_CLASSES = Object.fromEntries(YOLO_LABELS.map((l) => [l, `obj.${l.replace(/ /g, '_')}`])) as Record<string, ClipKey>;

export type AlertClass = string;

export const isAlertClass = (label: string): boolean => Object.prototype.hasOwnProperty.call(ALERT_CLASSES, label);

export const VEHICLES: ReadonlySet<string> = new Set(['car', 'motorcycle', 'bus', 'truck', 'bicycle']);
export const ANIMALS: ReadonlySet<string> = new Set(['dog', 'cow']);
