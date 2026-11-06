// Label maps embedded in the two models (read from their metadata, P6).
// EfficientDet-Lite0 uses the 90-id COCO map ('???' = unused ids); YOLO11n the 80-class map.

export const EFFDET_LABELS: readonly string[] = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light", "fire hydrant", "???", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "???", "backpack", "umbrella", "???", "???", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle", "???", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed", "???", "dining table", "???", "???", "toilet", "???", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "???", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"];

export const YOLO_LABELS: readonly string[] = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"];

/** F1 alert classes (COCO only) and their clip keys. */
export const ALERT_CLASSES = {
  person: 'obj.person',
  bicycle: 'obj.bicycle',
  car: 'obj.car',
  motorcycle: 'obj.motorcycle',
  bus: 'obj.bus',
  truck: 'obj.truck',
  dog: 'obj.dog',
  cow: 'obj.cow',
  chair: 'obj.chair',
  bench: 'obj.bench',
  couch: 'obj.couch',
  'dining table': 'obj.dining_table',
  'potted plant': 'obj.potted_plant',
  'fire hydrant': 'obj.fire_hydrant',
  'stop sign': 'obj.stop_sign',
} as const;

export type AlertClass = keyof typeof ALERT_CLASSES;

export const isAlertClass = (label: string): label is AlertClass => label in ALERT_CLASSES;

export const VEHICLES: ReadonlySet<AlertClass> = new Set(['car', 'motorcycle', 'bus', 'truck', 'bicycle']);
export const ANIMALS: ReadonlySet<AlertClass> = new Set(['dog', 'cow']);

/** YOLO class index → is an alert class (for decodeYolo's pre-NMS filter). */
export const YOLO_ALERT_MASK: readonly boolean[] = YOLO_LABELS.map((l) => isAlertClass(l));
