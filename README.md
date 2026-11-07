# Drishti

A voice-first Android assistant that sees for blind and low-vision users through the phone camera and speaks what is ahead in Hindi, Hinglish, English or Tamil. Built on Gnani AI's Prisma (speech-to-text) and Timbre (text-to-speech).

Drishti works alongside a cane, never instead of one.

- `app/` — React Native + Expo (TypeScript), Android only
- `server/` — thin FastAPI relay (holds API keys; relays Gnani STT/TTS and the vision model)

See [PLAN.md](PLAN.md) for the build plan and [LIMITATIONS.md](LIMITATIONS.md) for known gaps.

## Running

**App** (no Android Studio needed):

```sh
cd app
npm install
eas build -p android --profile development   # once, and again only when native packages change
npx expo start --dev-client                    # day to day; set SERVER_URL / APP_TOKEN in app/.env
npm test && npm run typecheck
```

**Server** (Python 3.11 via [uv](https://docs.astral.sh/uv/)):

```sh
cd server
cp .env.example .env        # fill in keys; never commit .env
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0
uv run pytest               # live tests (real credits) only with: uv run pytest -m live
```

## Known-good versions (pinned 2026-11-06, do not upgrade mid-build)

| Package | Version | Notes |
| --- | --- | --- |
| expo | 58.0.23 | React Native 0.88.1, React 19.3.0 |
| react-native-vision-camera | 5.2.4 | v5 is Nitro-based; frame processors need `react-native-vision-camera-worklets` + `react-native-worklets` |
| react-native-vision-camera-worklets | 5.2.4 | |
| react-native-worklets | 0.13.0 | Babel plugin is added by `babel-preset-expo` |
| react-native-nitro-modules | 0.37.2 | |
| react-native-nitro-image | 0.15.2 | Frame → Image → `resize()` → raw pixels (replaces the v4-only `vision-camera-resize-plugin`) |
| react-native-fast-tflite | 3.0.1 | GPU libraries enabled via config plugin |
| react-native-vision-camera-face-detector | 2.1.0 | Requires VisionCamera ≥ 5.0.10 |
| @react-native-ml-kit/text-recognition | 2.0.0 | OCR on a captured photo (no maintained v5 frame plugin exists) |
| @siteed/audio-studio | 3.2.1 | 16 kHz mono PCM streaming; phone-state, notification and background features disabled |
| expo-audio / expo-speech / expo-sqlite / expo-file-system / expo-haptics / expo-keep-awake | SDK 58 | |
| @react-native-community/netinfo | 12.0.1 | |
| fastapi / uvicorn / httpx / websockets / pydantic-settings | 0.162.0 / 0.54.0 / 0.28.1 / 17.4 / 2.16.2 | Locked in `server/uv.lock` |

## Model licences

| Model | Licence | Source |
| --- | --- | --- |
| EfficientDet-Lite0 (uint8 input 320×320 NHWC, built-in NMS: boxes/classes/scores/count, max 25) | Apache-2.0 | [TensorFlow Lite task library](https://storage.googleapis.com/download.tensorflow.org/models/tflite/task_library/object_detection/android/lite-model_efficientdet_lite0_detection_metadata_1.tflite) |
| YOLO11n (fp32 input 1×3×320×320 NCHW 0–1, output 1×84×2100 raw, NMS in app) | AGPL-3.0 | Exported with Ultralytics 8.x (`yolo export model=yolo11n.pt format=tflite imgsz=320`; fp16 export is no longer supported). Shipping it makes the app subject to AGPL-3.0 |
| MobileFaceNet (fp32 inputs `img1`, `img2` each 1×3×112×112 NCHW RGB 0–1, output 2×128; flip test-time augmentation and normalisation are inside the graph, so one call embeds two faces) | Apache-2.0 (weights from [foamliu/MobileFaceNet](https://github.com/foamliu/MobileFaceNet), trained on MS-Celeb-1M) | [Qualcomm AI Hub v0.66.0 TFLite float](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/mobile_facenet/releases/v0.66.0/mobile_facenet-tflite-float.zip), sha256 `2046ab77…f3d7` |

The repo's own licence is not set yet; it depends on whether YOLO11n stays (see PLAN.md, "Still open").
