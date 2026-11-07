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

## P3 — VLM services, /ask pipeline, benchmark script (2026-11-07)
- **Status:** automated tests pass (pytest 182, plus 8 `live` deselected) | live checks: OpenRouter /ask ×1 done, OpenRouter bench done; Vertex /ask skipped and Vertex benchmarking paused (user, 2026-11-07); a single Vertex bench run had already finished and is kept as a record
- **Limitations:**
  - L3.1 First audio misses the ≤ 2 s target. Live /ask (OpenRouter gemini-3.5-flash-lite, laptop in India, `stairs` case): VLM first token 1,229 ms, first sentence 1,420 ms, first audio 2,434 ms, total 3,260 ms. STT (~150 ms) and the upload come on top of that. Timbre (~1,000 ms per sentence, L2.1) is the largest single stage. Plan: try Timbre SSE/WebSocket streaming and re-measure from Cloud Run Mumbai (P13); the model choice comes later (L3.3).
  - L3.2 A sentence event is sent only once its audio is ready, so the app gets no text earlier. That's on purpose: events stay strictly in order, and if one sentence's TTS fails its event carries the text with `audio_b64: null` and `tts_error`, so the app can fall back to expo-speech (D12).
  - L3.3 VLM model not chosen. Interim: `openrouter` + `google/gemini-3.5-flash-lite` (fastest and most accurate in the bench below), set in the local `.env` only. Plan (user, 2026-11-07): when the app is complete, benchmark models on OpenRouter, preferring open-source ones, using `bench_vlm.py` and DT-7.2.
  - L3.4 Reasoning control differs by model. `{"enabled": false}` is rejected by gemini-3.5-flash-lite ("Reasoning is mandatory"); `{"effort": "minimal"}` is accepted by all the tested models, but Gemini 2.x still thinks at "minimal", which used up the 80-token budget (truncated or empty answers). The client sends `enabled: false` for `gemini-2*` and `effort: minimal` otherwise. A new model needs a check that it gives complete answers. On Vertex, Gemini 2.x uses `thinking_budget=0` and Gemini 3.x uses `thinking_level="minimal"`.
  - L3.5 The bench images are 8 Wikimedia Commons photos (credits in `server/bench/CREDITS.md`), not frames from the phone camera. Quality was eyeballed, not scored. Llama 4 Scout invented a bus number ("64C"; the plate reads MH 01 L 9442), and gpt-6-luna returned one empty answer.
  - L3.6 The splitter waits one character after a `.` to rule out decimals and abbreviations; `? ! ।` emit at once. When `?` and `!` arrive in separate deltas, the `!` is dropped (cosmetic).
  - L3.7 The system prompt's rules are in English, with a per-language instruction for language, script and direction words. That replaces the spec's "prompt in the target language", which risks untested Tamil/Hindi prompt text. The "spell numbers as words" rule is dropped (Timbre normalises digits, P2).
  - L3.8 `done`/`error` timings use `_ms`-suffixed keys (`vlm_first_token_ms`, `first_sentence_ms`, `first_audio_ms`, `total_ms`).
  - L3.9 `google-genai` pulls in `httpx2`, whose logger prints full request URLs at INFO. It's now silenced with `httpx`. The existing log-privacy test caught this.
  - L3.10 Vertex `asia-south1` (project screenify-497419) serves gemini-2.5-flash, gemini-3.5-flash-lite and gemini-3.5-flash, but not gemini-2.5-flash-lite or gemini-3.1-flash-lite. In one run, gemini-3.5-flash-lite timed out on 11 of 16 calls (> 15 s) while gemini-2.5-flash answered all 16 at a p50 of 756 ms to the first sentence. Not investigated (paused). Possibly capacity for a new model in that region.
- **Unverified assumptions:** the Vertex /ask path wasn't run through the server (only the client, via the bench). OpenRouter's provider routing and region for each model is unknown, so the laptop numbers include that hop.
- **Measurements** (laptop in India, 8 cases × 2 runs, first sentence p50/p95 ms; `server/bench/results/`):
  - OpenRouter: gemini-3.5-flash-lite 1,170/1,643 (16/16 ok); gemini-2.5-flash-lite 1,659/3,272 (16/16, rerun after the L3.4 fix; the first run's rows for it are invalid); llama-4-scout 1,524/3,326 (16/16); gpt-6-luna 1,752/2,687 (15/16).
  - Vertex asia-south1: gemini-2.5-flash 756/944 (16/16); gemini-3.5-flash-lite 5/16 ok (see L3.10).
  - Live /ask: first audio 2,434 ms against the ≤ 2 s target (L3.1).

## P4 — Clip packs (2026-11-07)
- **Status:** automated tests pass (pytest 195, plus 8 `live` deselected and 4 skipped until the packs exist) | live checks: deferred to the end (user, 2026-11-07); no clips generated yet
- **Limitations:**
  - L4.1 No MP3 clips exist yet. `clips.generated.ts` has `asset: null` for every clip, so the app must speak each clip's `text` with expo-speech until the packs are generated. Fixed-phrase latency and voice consistency (D12) are therefore not met yet. Plan: `uv run python scripts/gen_clips.py --langs hi-en,hi,en,ta` at the end (about 1,100–1,500 characters per pack, ≤ ~100 credits each by the P2 estimate).
  - L4.2 The Tamil and Hindi phrase text was written without a native-speaker check. Plan: listen through and fix when the packs are generated.
  - L4.3 The tutorial's Tamil command examples ("இவரை ராகுல் என்று சேமி", "இங்கிலீஷ் மே போலோ") must match the phrasings the command router accepts (P7/P11).
  - L4.4 Leading and trailing silence in Timbre MP3s hasn't been measured. Stitched alerts ("Car" + "left mein" + "paas") will sound gappy if each clip carries silence. Plan: measure with ffprobe once clips exist, and trim with ffmpeg in gen_clips if it's over ~80 ms.
  - L4.5 The earcons are synthesised sine tones (WAV, 24 kHz): listen_start, listen_stop, error. Not yet heard on the phone.
  - L4.6 First-person lines use feminine forms to match the female voices (Poorvi, Shivani). The spec's cane line keeps "karta hai".
- **Unverified assumptions:** Timbre speaks one-word clips ("aage", "paas") cleanly; Metro bundles `.mp3`/`.wav` with the default asset extensions.
- **Measurements:** none yet.

## P5 — App core: metrics, speech scheduler, audio (2026-11-07)
- **Status:** automated tests pass (Jest 41; `tsc` and `expo lint` clean; `expo export` bundles Android, 860 modules) | live checks: none in this phase | device checks DT-5.1–5.3 pending
- **Limitations:**
  - L5.1 No clip packs yet (L4.1), so every clip goes through expo-speech, which adds Android TTS start-up latency. DT-5.1 (no gap when stitching) and the < 100 ms alert target can only be judged after X-4.1.
  - L5.2 Fallback speech merges neighbouring spoken pieces into one TTS call, and a coalescing pause becomes a comma. Hinglish is spoken with the `en-IN` system voice; how good that sounds is unverified.
  - L5.3 A P0 does not interrupt another P0; the second one waits (and may go stale after 500 ms). An interrupted utterance is dropped, never resumed (F6). Reading (P3) is interrupted the same way. F7 "aage" / "repeat" will need to re-queue it (P7/P10).
  - L5.4 Stale drops apply per member of a coalesced group, using the scheduler's clock when the group reaches the head of the queue. Answers, reading and system lines are never dropped.
  - L5.5 One shared expo-audio player uses `replace()` per clip. Gapless stitching relies on `preload()`, which hasn't been measured on the device. If there are gaps, plan: one player per clip in the pack.
  - L5.6 Each expo-audio clip has a 30 s fallback timeout in case `didJustFinish` never fires.
  - L5.7 Connectivity: network loss means offline at once; with a network, two failed `/health` pings in a row (30 s apart) mean offline, so a dead server is noticed within about 60 s. `online` starts unknown. The spoken internet lost/back announcements are wired in P12.
  - L5.8 The debug overlay is a shell: it shows stage p50/p95, queue length and online state, with export and DT-5 test buttons. Boxes, track IDs and the F12 latency readout come in P6/P12. Triple-tap is detected on the root view, so taps on overlay buttons count too.
  - L5.9 Metrics export goes through React Native's `Share` (text message), not a file, so no new native package was needed. Very long sessions may exceed share-intent size limits; the rolling window caps it at 200 events.
  - L5.10 `expo lint` was set up on first use (eslint 9.39.5, eslint-config-expo 58.0.4, pinned); `require()` is allowed only in the asset map files.
- **Unverified assumptions:** expo-audio `preload()` makes `replace()` + `play()` near-instant on Android; `player.pause()` + resolving at once meets the ≤ 50 ms stop; expo-speech `onStopped` fires on `Speech.stop()`.
- **Measurements:** none yet (device checks pending).

## P6 — Reflex lane: detectors, tracker, hazard alerts (2026-11-07)
- **Status:** automated tests pass (Jest 89, pytest 195; `tsc` and `expo lint` clean; the Android export bundles and the frame callback compiles as a worklet with the expected closure) | live checks: none in this phase | device checks DT-6.1–6.5 pending. **Nothing in the camera path has run on the phone yet.**
- **Limitations:**
  - L6.1 The camera path (VisionCamera v5 `useFrameOutput` → `HybridFrameConverter.convertFrameToImage` → nitro-image `resize(320, 320)` → `toRawPixelData` → fast-tflite `runSync`) is untested on the device (L0.1/L0.2). The HybridObjects are passed into the worklet with `NitroModules.box()`. If a step throws, the debug overlay shows the frame error, and after 5 failures in a row the app says `sys.detector_failed`.
  - L6.2 Frames are requested as 640×480 `rgb` with `enablePhysicalBufferRotation` so they arrive upright. They are stretched to 320×320 (no letterbox), which distorts aspect for YOLO, trained on letterboxed input. Possible accuracy loss; check in DT-6.1.
  - L6.3 `frame_ts` is backdated by the worklet's own processing time only. The camera's capture-to-callback delay isn't counted (frame timestamps use another clock), so reflex latency reads slightly optimistic.
  - L6.4 The detector runs on every 2nd frame callback, and `dropFramesWhileBusy` sheds load if inference is slow. Detections/s is shown in the overlay; there's no adaptive rate yet.
  - L6.5 Tracker: greedy class + IoU > 0.3. Fast motion (IoU ≤ 0.3 between processed frames) makes a new track, which the per-class cooldown keeps quiet. A change held back by the cooldown is spoken when the cooldown ends, if it still applies (e.g. "person right" about 4 s after "person ahead"). A new object that is near, or an object turning near, always bypasses the cooldown.
  - L6.6 There's no confirmation frame for new tracks: a one-frame false positive at ≥ 0.5 confidence is announced. That's a trade-off for the < 100 ms target. Watch DT-6.3; if needed, require 2 frames for far objects only.
  - L6.7 Direction has 0.04 hysteresis around the third-lines. Near/far is still the F1 box rule (height > 45% or bottom in the lowest 15%), with no smoothing. Tune in DT-6.4, or replace it with simulated depth (F11).
  - L6.8 Priorities: vehicles at any distance and any near object are P0 (interrupt answers); everything else is P2. Persons are announced as "Vyakti"; names come in P8.
  - L6.9 YOLO decoding loops 2,100 × 80 in the worklet, with non-alert classes skipped before NMS. Its cost on Hermes is unmeasured (DT-6.1).
  - L6.10 Without generated clips (L4.1), alerts are spoken with expo-speech, so DT-6.2's < 100 ms needs the hi-en pack (X-4.1).
  - L6.11 Decoder tests use laptop CPU outputs (LiteRT 2.x) recorded by `app/scripts/make_detector_fixtures.py`. On-device GPU-delegate outputs may differ slightly.
  - L6.12 The P0 boot screen is removed. Use the overlay's detector switch to check that both models load (DT-0.3).
- **Unverified assumptions:** `toRawPixelData()` on the resized image returns a tightly packed 4-byte format (all nitro-image formats are handled, including row padding); fast-tflite's `runSync` returns outputs in model order (boxes, classes, scores, count for EfficientDet); `performance.now()` exists in the VisionCamera worklet runtime (falls back to `Date.now()`).
- **Measurements:** laptop CPU only: on the bench images both models find the bus (EfficientDet 0.91, YOLO 0.95, box IoU > 0.8), the vehicles in `autos` and the bench in `footpath`. No phone numbers yet.

## P7 — Push-to-talk, command router, scene questions (2026-11-07)
- **Status:** automated tests pass (Jest 200, pytest 195; `tsc` and `expo lint` clean; Android export bundles, 936 modules) | live checks: none in this phase | device checks DT-7.1–7.4 pending. **Mic, /stt, /ask and frame grab have not run on the phone.**
- **Limitations:**
  - L7.1 Streaming `/ask` uses React Native's XHR with `onprogress` (incremental `responseText`) instead of `expo/fetch`: it's core RN and handles `FormData` file parts. Whether chunks really arrive incrementally on Android (rather than all at the end) is unverified, and it decides whether sentence 1 plays early. Plan: watch `first_sentence_rx` vs the server's `first_sentence_ms` in DT-7.2. Fallback: `expo/fetch` streaming.
  - L7.2 The mic is audio-studio `startRecording` (16 kHz, 16-bit mono, 40 ms chunks, base64 decoded in JS, no file written). The PCM format on the device is unverified (P0 assumption). The first chunks may miss speech that starts within ~100 ms of the press.
  - L7.3 Pressing the talk surface stops all speech, alerts included (`stopAll`). Presses under 300 ms are treated as taps (no STT; the debug triple-tap still works). With TalkBack on, hold is double-tap-and-hold (P12 accessibility pass).
  - L7.4 Router: keyword rules on normalised text (lower case, no punctuation, "is ko" → "isko", "what's" → "what is"). "Stop" words count only in utterances of ≤ 3 words, and "bas" only on its own (Prisma spells "bus" as "bas"). "Read" matches anywhere ("can you read the bus number" → OCR, not the VLM). Tamil coverage is a few phrasings (language switch, stop, read, who, describe); a full Tamil table comes in P11.
  - L7.5 Save/delete/list (P9), read (P10) and language (P11) say "Ye abhi uplabdh nahi hai". "Who is here" says nobody is recognised until P8.
  - L7.6 F6 no-resume: when a hazard interrupts an answer sentence, that answer's queued sentences are dropped and any still streaming are skipped. "Repeat" replays the last full answer.
  - L7.7 "Dekh rahi hoon" plays while waiting, at the answer's priority (FIFO), and is dropped if still queued when sentence 1 arrives. If it's already playing, sentence 1 waits for it to finish (≤ ~1 s). This may cost first-audio time; drop it if DT-7.2 is tight.
  - L7.8 Offline: no STT session starts. Release says "Internet nahi hai"; alerts are unaffected. "Offline" is ConnectivityMonitor's view (network lost, or 2 failed pings), so a server that just died is noticed only through STT errors, which give "Samajh nahi aaya".
  - L7.9 The /ask frame is the next camera frame after STT finishes, grabbed in the worklet as a JPEG (longest side 512, quality 70), with a 1 s timeout. That adds up to one frame interval plus encode time to `ask_sent` (unmeasured).
  - L7.10 Answer audio goes to rotating cache files (`ans-0..29.mp3`, `ask-0..3.jpg`). After 30 sentences a file still queued could be overwritten (unlikely with 2-sentence answers).
  - L7.11 Answer metrics: `ptt_release`, `stt_final`, `ask_sent`, `first_sentence_rx`, `play_start` (by the scheduler, first sentence), plus the server's `done` timings. Transcripts appear only on the debug overlay, never in metrics or logs.
- **Unverified assumptions:** RN WebSocket's third-argument `headers` reaches the `/stt` handshake on Android; `toEncodedImageData('jpg', 70)` works from the worklet; expo-audio earcon players replay after `seekTo(0)`.
- **Measurements:** none yet (device checks pending).

## P8 — Person identification (2026-11-08)
- **Status:** automated tests pass (Jest 239, pytest 195; `tsc` and `expo lint` clean; the Android export bundles, 989 modules, and every face function compiles as a worklet with the expected closure) | live checks: laptop face check done (below) | device checks DT-8.1–8.4 pending. **ML Kit faces, the embedder and the YUV frame path have not run on the phone.**
- **Limitations:**
  - L8.1 The whole face path is untested on the device: ML Kit `detectFaces(frame)` inside our `useFrameOutput` worklet (L0 assumption), nitro-image `crop`, and fast-tflite with two inputs. If the ML Kit native module is missing, faces are off and the debug overlay shows `faces: FAILED`; obstacle alerts keep working.
  - L8.2 Frames changed from 640×480 `rgb` to 1280×720 `yuv`: ML Kit's frame API only reads YUV media images, and a 480 px-wide frame only gives an 80 px face at about 0.8 m (720 px: about 1.2 m). The detector's RGB conversion still works (CameraX `toBitmap` handles YUV), but converting and resizing a bigger frame costs more, unmeasured. This affects DT-6.1 numbers too. Naming at 2 m (F3 acceptance says 1–2 m) would need 1920×1080 or a lower `minFacePx`. Plan: DT-8.2 and DT-8.4; `VISION.frameResolution` is one config value.
  - L8.3 Threshold 0.5 instead of the spec's 0.65 start (`IDENTITY.threshold`). The model's LFW threshold is cosine 0.27; on the laptop the same person scored 0.82 and different people 0.06–0.14. Plus an ambiguity margin: the best person must beat the runner-up by 0.08, else unknown. Plan: DT-8.1 on device.
  - L8.4 Alignment uses ML Kit's eyes and mouth corners (the nose is left out: ML Kit's NOSE_BASE isn't the template's nose tip). Without eye landmarks it maps the face box to the template, which is rougher (laptop: same person 0.82, others ≤ 0.22). The crop is 2.2× the face box, not the spec's 20% margin, so it holds the whole aligned window.
  - L8.5 The face step runs only on detector frames that contain a `person` detection, synchronously after the detector (same frame). It adds ML Kit (`fast`, landmarks on), up to 2 crops, warps and one embedder call to the worklet. Target 20–40 ms (DT-8.4); `dropFramesWhileBusy` sheds frames if it's slower.
  - L8.6 A face counts only if its centre is inside a person box. A person the detector misses (e.g. only a face in view, very close) is never identified.
  - L8.7 Announcement rules: a name sticks to a track once decided (it never flips to another name; unknown can still become a name). A name is announced once per appearance (5 min absent = new appearance), at P1. If the announcement is dropped as stale (> 500 ms waiting behind an answer) or cut by a hazard, it's retried while the person is in view; one the user stopped isn't. "Unknown person" is said once per track and at most once per 30 s overall (my addition; the spec has no cooldown). The reflex lane still says "Vyakti …" for a person first; the name follows.
  - L8.8 Names are spoken as "<name> aapke saamne hai" + direction clip via expo-speech, since name clips come in P9. The template per language is in `NAME_TEMPLATE`; P11 should check the en/ta wording.
  - L8.9 Dev-only "Seed face" (debug overlay, `__DEV__`) saves the largest face in the next 5 frames as "Test N", with no consent step. "Delete seeds" removes them. Both are removed in P9.
  - L8.10 Model: MobileFaceNet from Qualcomm AI Hub (Apache-2.0, weights from foamliu/MobileFaceNet trained on MS-Celeb-1M; that dataset was withdrawn and its terms are research-oriented). Float32, NCHW, 4 MB, with the flip augmentation inside the graph (4 backbone passes per call). The GPU delegate may refuse it, in which case it falls back to CPU (the overlay shows which).
  - L8.11 The similarity log (`Export face log`) keeps the last 1,000 embedded faces in memory with the best candidate's name, and leaves the phone only through the share sheet. It isn't added to the metrics export (names stay out of metrics).
- **Unverified assumptions:** CameraX gives `rotationDegrees = 0` with buffer rotation on, so ML Kit coordinates are upright and match the converted image (coordinates are rescaled by ML Kit's frame size anyway); ML Kit returns landmarks in `fast` mode with `runLandmarks`; `Image.crop(x1, y1, x2, y2)` takes end coordinates (per the nitro-image docs); fast-tflite `runSync` takes inputs in model order (`img1`, `img2`).
- **Measurements:** laptop only (`app/scripts/face_check/`, 4 photos: an LFW pair of one person, plus two public-domain portraits): same person 0.818, different people 0.062–0.143 with landmarks (0.087–0.223 box-only). With Qualcomm's demo template (25% padding), different people scored up to 0.626; that's why the InsightFace template is used. No phone numbers yet.

## P9 — Voice enrollment (2026-11-08)
- **Status:** automated tests pass (Jest 292, pytest 195; `tsc` and `expo lint` clean; the Android export bundles, 993 modules) | live checks: none (the name-clip /tts check is deferred, X-9.1) | device checks DT-9.1–9.3 pending. **Enrollment has not run on the phone; it depends on the P8 face path (L8.1).**
- **Limitations:**
  - L9.1 Consent is a yes/no transcript taken from whoever speaks while the user holds the talk button. The app can't tell that it was the person being saved who said yes. Only a clear yes counts ("haan", "yes", "theek hai", "हाँ", "ஆம்", …); any no-word wins ("haan nahi" → no), and anything else cancels.
  - L9.2 While the dialog waits for a name or a yes, the next transcript is its answer and is not routed (so "saamne kya hai" then isn't a question). "Ruko" cancels. With no answer within 30 s, it says "Theek hai, save nahi kiya". A reply that STT doesn't catch says "Samajh nahi aaya" and the dialog keeps waiting. "Naam bataiye" is asked once more, then the dialog cancels.
  - L9.3 Capture needs the person detector to see a person (faces are only looked for then, L8.6), and exactly one face that is embeddable (≥ 80 px) and ≥ 100 px. It keeps up to 10 frames at least 300 ms apart within 4 s, counted from the "face the camera" prompt. Fewer than 5 → "Chehra saaf nahi dikha…". There's no separate "two faces" message: it's the same line.
  - L9.4 Saving a name that already exists adds the new embeddings to that person (my choice; the spec doesn't say). There is no spoken "this name exists".
  - L9.5 Name clips ("{name} aapke saamne hai" per language) are fetched for the current language only, right after saving, at startup and whenever the connection comes back. P11 should call `nameClips.sync(lang)` on a language switch. One failure stops a run (the rest wait for the next sync). Until a clip exists the name is spoken by expo-speech.
  - L9.6 Delete removes the person's rows and clip files, then says "Delete ho gaya", with no confirmation question. "Delete karo" without a name asks for it.
  - L9.7 List reads the names with expo-speech after the "Saved log hain:" clip.
  - L9.8 Hindi-script phrasings were added to the router (save, delete, list) for names in Devanagari. Prisma's transliterate mode should give Latin script for Hindi and Hinglish, so these are a fallback. Tamil enrollment phrasings are still missing (P11).
  - L9.9 The P8 dev seed is removed; the face log export stays.
- **Unverified assumptions:** the expo-file-system `Directory`/`File` API writes and deletes under `Paths.document` as typed; a `file` part with a documents uri plays through expo-audio like answer files do; Timbre pronounces Indian names acceptably (DT-9.3).
- **Measurements:** none yet.

## Deferred tests and checks (run at the end)

Everything skipped or postponed so far, in one place. Device checks (`DT-x.y`) are in the next table.

| ID | Phase | What | Command / how | Why deferred |
| --- | --- | --- | --- | --- |
| X-3.1 | P3 | Vertex /ask through the server (one call) | `VLM_PROVIDER=vertex VLM_MODEL=gemini-2.5-flash uvicorn …` + `scripts/ask_probe.py --case stairs` | Vertex paused (user) |
| X-3.2 | P3 | Investigate the Vertex gemini-3.5-flash-lite timeouts in asia-south1 (L3.10) | bench on Vertex | Vertex paused (user) |
| X-3.3 | P3 | Model benchmark, open-source models on OpenRouter preferred; pick D16 | `scripts/bench_vlm.py --runs 2 openrouter:<model> …` | after the app is complete (user) |
| X-3.4 | P3 | Timbre SSE/WebSocket streaming for faster first audio (L2.1, L3.1) | prototype + `ask_probe.py` | first audio is over target; with P13 re-measure |
| X-4.1 | P4 | Generate the hi-en pack and listen to 10 random clips; note mispronunciations | `scripts/gen_clips.py --langs hi-en` | deferred (user) |
| X-4.2 | P4 | Generate the hi, en and ta packs; native-speaker check of the Hindi and Tamil text | `scripts/gen_clips.py --langs hi,en,ta` | deferred (user) |
| X-4.3 | P4 | Measure clip leading/trailing silence; trim if needed (L4.4) | ffprobe / ffmpeg | needs X-4.1 |
| X-7.1 | P7 | Run DT-7.2 once per VLM provider (OpenRouter now; Vertex when unpaused) | device + `VLM_PROVIDER` switch | Vertex paused (user) |
| X-9.1 | P9 | Name clips through the server: 5 Indian names in hi-en and en (DT-9.3's text); listen for mispronunciations | `uv run python scripts/tts_probe.py --lang hi-en "Rahul aapke saamne hai"` (and Priya, Aishwarya, Venkatesh, Gurpreet) | spends Gnani credits (user) |
| X-4.4 | P4 | Re-check Gnani credits used after the packs (L2.9) | Gnani dashboard | needs X-4.1/X-4.2 |

## Pending device tests

| ID | Check | Phase | Result | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| DT-0.1 | APK installs on Realme 11 Pro (Android 15) and opens | P0 | pending | | |
| DT-0.2 | Camera preview shows after permission grant | P0 | pending | | |
| DT-0.3 | Both detector models load; note load ms and whether delegate shows `android-gpu` | P0 | pending | | |
| DT-0.4 | `npx expo start --dev-client` hot-reloads a text change | P0 | pending | | |
| DT-5.1 | Bundled clips play with no audible gap when stitched (overlay "Stitch" button; needs X-4.1 clips) | P5 | pending | | |
| DT-5.2 | P0 interrupts a long answer within 100 ms (overlay "Long answer", then "P0 now"; read reflex play_start) | P5 | pending | | |
| DT-5.3 | Playback follows the system volume | P5 | pending | | |
| DT-6.1 | Benchmark both detectors: infer ms, total ms, det/s, GPU vs CPU (overlay switch); choose the default | P6 | pending | | |
| DT-6.2 | Chair about 1.5 m ahead, airplane mode: announced < 100 ms after detection, correct direction (needs X-4.1 clips) | P6 | pending | | |
| DT-6.3 | Facing one chair for 30 s → exactly one alert | P6 | pending | | |
| DT-6.4 | Tune near/far thresholds while walking toward an object | P6 | pending | | |
| DT-6.5 | Phone temperature and battery drain after 15 min of continuous use | P6 | pending | | |
| DT-7.1 | Each fixed command works with 2 phrasings (overlay shows transcript → command) | P7 | pending | | |
| DT-7.2 | Median release → first audio ≤ 2 s over 20 questions, on Wi-Fi and on 4G (overlay describe play_start p50) | P7 | pending | | |
| DT-7.3 | A car alert interrupts a long answer within 100 ms, and the answer does not resume | P7 | pending | | |
| DT-7.4 | Airplane mode: a question gets "Internet nahi hai"; alerts keep working | P7 | pending | | |
| DT-8.1 | Calibrate the threshold with 3 real people: seed each (dev), export the face log while each faces the camera and while strangers do; pick the threshold | P8 | pending | | |
| DT-8.2 | Each enrolled person is named within 1 s at 1–2 m (note the farthest distance that works at 1280×720, L8.2) | P8 | pending | | |
| DT-8.3 | An unenrolled person → "unknown" in 10 of 10 trials, never named | P8 | pending | | |
| DT-8.4 | Face step time per frame (overlay "face step", target 20–40 ms), embedder delegate, and the detector's total ms at 1280×720 vs DT-6.1 | P8 | pending | | |
| DT-9.1 | Eyes closed: enroll ("isko <name> ke naam se save karo" → the person says haan → face the camera), hear the name announced, then delete, by voice only | P9 | pending | | |
| DT-9.2 | Offline enroll → the name is spoken by expo-speech; back online, the Timbre clip replaces it (overlay shows ♪) | P9 | pending | | |
| DT-9.3 | Timbre pronunciation of 5 Indian names; note any that need phonetic spelling (open question §11; see X-9.1) | P9 | pending | | |
