# Limitations log

One section per phase, written at the phase gate (see PLAN.md). Device tests the user hasn't run yet are listed at the end.

## P0 — Repo, tooling, first dev build (2026-11-06)
- **Status:** automated tests pass (Jest 4, pytest 2, `tsc` clean) | live checks: none in this phase
- **Limitations:**
  - L0.1 fast-tflite's documented VisionCamera integration targets v4; its v5 integration is private (sponsor-only). We call `runSync` from a v5 frame worklet ourselves, which is not yet tested. Impact: the whole Reflex lane (P6). Plan: prove it in P6. If HybridObjects can't be captured in the worklet, fall back to `NitroModules.box()` / `unbox()`.
  - L0.2 There is no `vision-camera-resize-plugin` for v5. Resizing goes Frame → nitro-image `Image` → `resize()` → `toRawPixelData()` (RGBA), then the alpha channel is stripped in JS. This adds a copy per frame, cost unknown. Impact: P6 latency budget. Plan: measure in DT-6.1, and lower `targetResolution` if too slow.
  - L0.3 OCR uses `@react-native-ml-kit/text-recognition` 2.0.0 on a captured photo. expo-doctor flags it as "untested on New Architecture". Impact: F7 (P10). Plan: check it loads in the dev build. If it fails, write a small Expo module around ML Kit.
  - L0.4 YOLO11n is AGPL-3.0, and the repo is public. Plan: decide after DT-6.1 (see PLAN.md, "Still open").
  - L0.7 YOLO11n ships fp32 (10.7 MB): Ultralytics' LiteRT exporter no longer does fp16, and int8 needs a calibration set. Its input is channels-first (NCHW) float, so preprocessing must write planar RGB, and its NMS runs in JS (2100 candidates). Plan: measure in DT-6.1, try int8 if slow.
  - L0.8 EfficientDet-Lite0's built-in NMS op (`TFLite_Detection_PostProcess`) isn't supported by the GPU delegate, so that part of the graph runs on CPU. Plan: measure in DT-6.1.
  - L0.5 The model-load screen is P0-only. The spoken load-failure behaviour (§9) comes in P6/P12.
  - L0.6 `starlette.testclient` warns that httpx is deprecated for it. Harmless for now.
- **Unverified assumptions:** the GPU delegate (`android-gpu`) works on the Realme 11 Pro's Mali-G68 (DT-0.3); the face-detector 2.1 frame API inside a `useFrameOutput` worklet (P8); @siteed/audio-studio streams 16 kHz PCM chunks (P7).
- **Measurements:** laptop CPU sanity check on a street image: both models detect the bus and the people (EfficientDet bus 0.82, person 0.80). No phone numbers yet.

## Pending device tests

| ID | Check | Phase | Result | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| DT-0.1 | APK installs on Realme 11 Pro (Android 15) and opens | P0 | pending | | |
| DT-0.2 | Camera preview shows after permission grant | P0 | pending | | |
| DT-0.3 | Both detector models load; note load ms and whether delegate shows `android-gpu` | P0 | pending | | |
| DT-0.4 | `npx expo start --dev-client` hot-reloads a text change | P0 | pending | | |
