"""Laptop face check (P8): real photos through the app's own alignment and the shipped model.

    cd app
    uv run --python 3.11 --with mediapipe==0.10.14 --with pillow --with numpy \
        python scripts/face_check/landmarks.py /tmp/fc/lm.json a1.jpg a2.jpg b.jpg c.jpg
    npx tsx@4.19.2 scripts/face_check/align.ts /tmp/fc/lm.json /tmp/fc
    uv run --python 3.11 --with ai-edge-litert --with numpy \
        python scripts/face_check/matrix.py /tmp/fc assets/models/mobilefacenet.tflite

landmarks.py: MediaPipe face box + eye keypoints, and each photo as raw RGBA next to it.
align.ts: planFaceCrop + warpFace (src/vision/faceAlign.ts) → 112×112 tensors, with landmarks
("aligned") and box-only ("box"). matrix.py: cosine matrix (expects exactly 4 photos).
Photos are not committed.
"""
import json, sys, numpy as np
from PIL import Image
import mediapipe as mp
out = {}
with mp.solutions.face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.5) as fd:
    for path in sys.argv[2:]:
        img = np.array(Image.open(path).convert("RGB")); H, W = img.shape[:2]
        r = fd.process(img).detections[0]
        bb = r.location_data.relative_bounding_box
        kp = r.location_data.relative_keypoints  # 0 right eye (image-left), 1 left eye
        rgba = np.concatenate([img, np.full((H, W, 1), 255, np.uint8)], axis=2)
        raw = path + ".rgba"; rgba.tofile(raw)
        out[path] = {"W": W, "H": H, "raw": raw,
            "box": {"x": bb.xmin * W, "y": bb.ymin * H, "width": bb.width * W, "height": bb.height * H},
            "lm": {"RIGHT_EYE": {"x": kp[0].x * W, "y": kp[0].y * H}, "LEFT_EYE": {"x": kp[1].x * W, "y": kp[1].y * H}}}
json.dump(out, open(sys.argv[1], "w"), indent=1)
print(json.dumps(out, indent=1))
