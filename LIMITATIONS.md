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
