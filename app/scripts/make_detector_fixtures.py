"""Record raw detector outputs on bench images for the app's decoder tests (P6).

    uv run --python 3.11 --with ai-edge-litert --with numpy --with pillow \
        python app/scripts/make_detector_fixtures.py

For each image: stretch to 320x320 RGB (as the app does), run EfficientDet-Lite0 and YOLO11n on
the laptop CPU, and save to app/src/vision/__fixtures__/<image>.json:
- efficientdet: all four outputs as-is (boxes, classes, scores, count).
- yolo: the [84, N] columns whose best class score >= 0.05 (the rest can't pass any threshold),
  stored column-major as the app sees them, plus N.
- expected: a NumPy reference decode (conf >= 0.25, class-wise NMS IoU 0.45) for both models.
"""

import json
import zipfile
from pathlib import Path

import numpy as np
from ai_edge_litert.interpreter import Interpreter
from PIL import Image

APP = Path(__file__).resolve().parents[1]
REPO = APP.parent
MODELS = APP / "assets" / "models"
OUT = APP / "src" / "vision" / "__fixtures__"
IMAGES = ["bus_number", "autos", "footpath"]
CONF, IOU, KEEP = 0.25, 0.45, 0.05

EFF_LABELS = zipfile.ZipFile(MODELS / "efficientdet_lite0.tflite").read("labelmap.txt").decode().splitlines()
YOLO_LABELS = json.loads(zipfile.ZipFile(MODELS / "yolo11n_float32.tflite").read("metadata.json"))["names"]


def run(path: Path, x: np.ndarray) -> list[np.ndarray]:
    it = Interpreter(model_path=str(path))
    it.allocate_tensors()
    it.set_tensor(it.get_input_details()[0]["index"], x)
    it.invoke()
    return [it.get_tensor(d["index"]) for d in it.get_output_details()]


def iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def nms(dets: list[dict]) -> list[dict]:
    kept: list[dict] = []
    for d in sorted(dets, key=lambda d: -d["score"]):
        if all(k["label"] != d["label"] or iou(k["box"], d["box"]) <= IOU for k in kept):
            kept.append(d)
    return kept


def r(v) -> float:
    return round(float(v), 4)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name in IMAGES:
        img = Image.open(REPO / "server" / "bench" / "images" / f"{name}.jpg").convert("RGB")
        arr = np.asarray(img.resize((320, 320), Image.BILINEAR))

        boxes, classes, scores, count = run(MODELS / "efficientdet_lite0.tflite", arr[None].astype(np.uint8))
        eff_expected = [
            {"label": EFF_LABELS[int(classes[0, i])], "score": r(scores[0, i]),
             "box": [r(boxes[0, i, 1]), r(boxes[0, i, 0]), r(boxes[0, i, 3]), r(boxes[0, i, 2])]}
            for i in range(int(count[0])) if scores[0, i] >= CONF
        ]

        (y,) = run(MODELS / "yolo11n_float32.tflite", (arr.astype(np.float32) / 255).transpose(2, 0, 1)[None])
        y = y[0]
        cols = np.where(y[4:].max(0) >= KEEP)[0]
        sub = y[:, cols]
        cand = []
        for j in range(sub.shape[1]):
            c = int(sub[4:, j].argmax())
            s = float(sub[4 + c, j])
            if s >= CONF:
                cx, cy, w, h = sub[:4, j]
                cand.append({"label": YOLO_LABELS[str(c)], "score": r(s),
                             "box": [r(cx - w / 2), r(cy - h / 2), r(cx + w / 2), r(cy + h / 2)]})
        fixture = {
            "image": f"server/bench/images/{name}.jpg",
            "efficientdet": {
                "boxes": [r(v) for v in boxes.ravel()],
                "classes": [r(v) for v in classes.ravel()],
                "scores": [r(v) for v in scores.ravel()],
                "count": [r(count[0])],
            },
            # Row-major [84, N] like the model's [1, 84, 2100] output, restricted to N kept columns.
            "yolo": {"n": int(sub.shape[1]), "data": [r(v) for v in sub.ravel()]},
            "expected": {"efficientdet": eff_expected, "yolo": nms(cand)},
        }
        (OUT / f"{name}.json").write_text(json.dumps(fixture) + "\n")
        print(name, "effdet", [(d["label"], d["score"]) for d in eff_expected][:6],
              "| yolo", [(d["label"], d["score"]) for d in nms(cand)][:6], "| yolo cols", sub.shape[1])


if __name__ == "__main__":
    main()
