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

## P1 — Server skeleton: auth, rate limit, health (2026-11-06)
- **Status:** automated tests pass (pytest 31) | live checks: local uvicorn smoke test done (HTTP 401/200, WebSocket 401 denial and accept, with the `websockets` impl)
- **Limitations:**
  - L1.1 The rate limit lives in memory per instance. With more than one Cloud Run instance, each gets its own 30/min window, and a restart resets it. Accepted while min = max = 1. Plan: set `--max-instances 1` in P13.
  - L1.2 `/health` is exempt from the rate limit (it is pinged for connectivity and costs no credits), but it still requires the token.
  - L1.3 Unauthenticated requests aren't rate-limited. They are rejected before any paid API call, so credits aren't at risk. Accepted.
  - L1.4 The 401 denial on the WebSocket handshake works with uvicorn's `websockets` implementations only. `wsproto` isn't installed, and the Dockerfile pins `--ws websockets`.
  - L1.5 The Docker image wasn't built locally (Docker daemon not running). Plan: build it in P13.
  - L1.6 `/health` reports only that the process is up. It doesn't check that Gnani or the VLM are reachable. Plan: revisit in P13 if needed.
- **Unverified assumptions:** Cloud Run passes the `Authorization` header and WebSocket upgrade through unchanged (P13).
- **Measurements:** none (no latency-relevant code yet).

## P2 — Gnani relay: /tts and /stt (2026-11-06)
- **Status:** automated tests pass (pytest 93, plus 8 `live` deselected) | live checks done: TTS ×4 languages, STT ×8 fixtures through `/stt`, one `-m live` test, a numbers round trip
- **Limitations:**
  - L2.1 Timbre REST takes 470–950 ms per short line from a laptop in India (hi 948, hi-en 873/471, ta 774, en 530 ms). The spec estimated 150–300 ms. Impact: the ≤ 2 s answer target (P3) and enrollment name clips. Plan: in P3, try Timbre SSE streaming for a faster first audio chunk, and re-measure from Cloud Run Mumbai (P13).
  - L2.2 Realtime Prisma rejects language lists (`hi-IN,en-IN`: "exactly one locale is required") although the docs allow them. Each language sends a single locale.
  - L2.3 Hindi and Hinglish use `format=transliterate` (Latin output), not the spec's `codemix`. The command router (P7) must match romanised words and handle split forms ("is ko" vs "isko"). Hindi numbers transcribe poorly in this mode: Timbre's "बस 42 आ रही है" came back as "Bas biali saari hai". Impact: questions with Hindi numbers ("kya ye bus 42 hai") may reach the VLM garbled. Plan: test real voices in DT-7.1/7.2, and try `codemix` for the `hi` language if it's bad.
  - L2.4 `detected_language_code` is null in transliterate mode, as the docs say.
  - L2.5 The STT fixtures are Timbre-synthesised speech, not real voices. Real-voice accuracy (accents, street noise, the phone mic) is untested. Plan: DT-7.1/7.2.
  - L2.6 After commit, the relay waits 150 ms for a late `speech_start`. That's the floor of release→final when the transcript is already in. Accepted.
  - L2.7 The relay forwards frames as they fill rather than strictly every 32 ms. Network jitter can bunch frames, which Gnani says degrades VAD. We commit on release, so VAD timing matters less. Accepted; watch DT-7.1.
  - L2.8 Prisma's `connected` config shows undocumented interim results (`partials_enabled: false`, `partial_interval_ms: 450`). They aren't used. They could show live captions later.
  - L2.9 Credit cost: the user reports P2's live checks used under 100 credits (exact figure not visible). That covered about 13 TTS calls (~0.5 min of audio out) and about 20 STT sessions (~1 min of audio in), so roughly ≤ 65 credits per audio minute. 5,000 credits should then cover at least ~75 min of combined STT+TTS. That's a loose upper bound. Plan: keep using fixtures and cached clips, and re-check the dashboard after P4 generates the clip packs.
  - L2.10 Hinglish TTS (Poorvi, Timbre v2.5) says digits in English ("forty two"). Natural for Hinglish; accepted.
- **Unverified assumptions:** the Timbre 429 retry path and Prisma's concurrent-session cap weren't hit live; Gnani's `x-idle-timeout-sec` and `x-min-silence-ms` values weren't tuned.
- **Measurements:** Prisma transcription latency 62–102 ms per segment. `/stt` release→final 152–155 ms on all 8 fixtures (local server → Gnani). Timbre REST 471–948 ms. All 8 fixtures transcribed correctly in hi, hi-en, en and ta.

## Pending device tests

| ID | Check | Phase | Result | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| DT-0.1 | APK installs on Realme 11 Pro (Android 15) and opens | P0 | pending | | |
| DT-0.2 | Camera preview shows after permission grant | P0 | pending | | |
| DT-0.3 | Both detector models load; note load ms and whether delegate shows `android-gpu` | P0 | pending | | |
| DT-0.4 | `npx expo start --dev-client` hot-reloads a text change | P0 | pending | | |
