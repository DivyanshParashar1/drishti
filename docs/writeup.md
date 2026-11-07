# Drishti: a voice-first seeing aid in Hindi, Hinglish, English and Tamil

*Draft for the Gnani AI Great Indian AI Internship Challenge. Bracketed items are for the team to fill in before submitting.*

## The problem

India has millions of blind and low-vision people, and most assistive apps assume English and a good connection. A cane finds what is at foot level, but not the car pulling out on the left, the friend who just walked up, or what the notice on the wall says. Existing apps make you point, tap, wait and listen to a long description; on a busy street that is too slow to be useful.

## The users

Blind and low-vision people in India who speak Hindi, Hinglish, English or Tamil, and use an Android phone. Drishti is designed as smart sunglasses (camera, IR, depth); for the contest, the phone stands in for the glasses and runs the full software. It is used with a cane, never instead of one.

## What it does

| | How | Network |
| --- | --- | --- |
| Instant hazard alerts: "Car left mein, paas" | On-device object detection (EfficientDet-Lite0 or YOLO11n), tracking, and pre-recorded voice clips | Offline |
| Names people you've saved: "Rahul aapke saamne hai, left mein" | On-device face detection (ML Kit) and face signatures (MobileFaceNet); strangers are only ever "unknown" | Offline |
| Answers any question about the scene: "Saamne kya hai?" | Hold the screen and speak → Gnani Prisma → a hosted vision model → Gnani Timbre, sentence by sentence | Online |
| Reads signs and notices aloud | On-device OCR (Latin and Devanagari) → Gnani Timbre | OCR offline, voice online (phone voice offline) |
| Save, delete and list people, by voice, with consent | "Isko Rahul ke naam se save karo" → "Kya aap save hone ke liye raazi hain?" → "haan" | Offline (the name clip is fetched later) |
| Switch language by voice | "Tamil mein bolo" | — |

The whole screen is one button: hold to talk, release to send. Everything else is automatic.

## How we use Gnani AI

Every word the user hears or speaks goes through Gnani, except the instant alerts, which are Gnani audio recorded in advance.

- **Prisma (speech-to-text), streaming over WebSocket.** The phone streams 16 kHz PCM while the user holds the screen; our relay forwards it to Prisma and returns the final transcript about 150 ms after release (laptop measurement, 8 test recordings in 4 languages, all transcribed correctly). For Hindi and Hinglish we use `hi-IN` with transliteration, so commands like "isko Rahul ke naam se save karo" arrive in Latin script and a simple keyword router can act on them; Tamil arrives in Tamil script.
- **Timbre (text-to-speech), in four ways:**
  1. *Clip packs:* every fixed phrase (55 per language: objects, directions, warnings, tutorial) is generated once with Timbre and bundled, so alerts play with zero network delay.
  2. *Answers:* the relay splits the vision model's answer into sentences and sends each to Timbre as soon as it is complete, so sentence 1 plays while sentence 2 is still being generated.
  3. *Name clips:* when someone is saved, "{name} aapke saamne hai" is generated per language and stored on the phone, so recognition stays offline.
  4. *Reading:* OCR text is chunked at sentence ends (including the Hindi `।`) and fetched chunk by chunk, with the next chunk fetched while the current one plays.

## Architecture

```
Phone (Expo / React Native, Android)                     Relay (FastAPI on Cloud Run, asia-south1)
├─ Camera → detector → tracker → alert clips (offline)   ├─ /stt  WebSocket → Gnani Prisma
├─ ML Kit faces → MobileFaceNet → match (offline)        ├─ /tts  → Gnani Timbre
├─ ML Kit OCR → reading order → chunks                   ├─ /ask  image + question → vision model (streamed)
├─ Push-to-talk → /stt → command router or /ask          │         → sentence split → Timbre per sentence → SSE
└─ One speech queue with priorities (hazards interrupt)  └─ token auth, rate limit, privacy-safe logs
```

The relay holds all API keys; the app holds only a token for the relay. A single speech queue arbitrates everything the user hears: a vehicle alert interrupts any answer, a name waits for the current sentence, and stale alerts are dropped rather than played late.

## Privacy and safety

- **No photos are stored.** Saved people are kept as 128-number face signatures on the phone, only after a spoken yes. Delete removes the signatures and the name audio.
- **No transcripts, questions, answers, images or names are logged**, on the phone or the server. The server's logger accepts only an allow-list of fields (timings, status codes, language), and tests check every logging call in both codebases.
- **Strangers are never identified**, only "unknown". A wrong name is treated as worse than "unknown": a name is spoken only when the same person wins 3 of 5 frames by a clear margin.
- **Works without internet where it matters.** Hazard alerts and recognition are fully on the device; losing the connection is announced ("Internet chala gaya, alerts chalu hain").
- **Covered or dark camera** is announced, and repeated every 20 s while it lasts, so a user never assumes alerts are working when they can't be.

## Numbers

Measured so far (laptop against the local relay):

| Stage | Measured | Target |
| --- | --- | --- |
| Prisma: release → final transcript | 152–155 ms | 300–600 ms |
| Timbre: one sentence (REST) | 471–948 ms | 150–300 ms |
| Vision model, first sentence (OpenRouter gemini-3.5-flash-lite, 16 runs) | p50 1,170 ms, p95 1,643 ms | 0.5–1 s |
| Question → first audio (whole `/ask` pipeline) | 2,434 ms | ≤ 2 s median |
| Face check: same person vs different people (cosine similarity) | 0.82 vs 0.06–0.14 | clear separation |

On the phone (from the in-app metrics export; [fill in from the exported JSON after the device run]):

| Event | p50 | p95 | Target |
| --- | --- | --- | --- |
| Hazard: frame → audio starts | [ ] | [ ] | < 100 ms, offline |
| Name: frame → audio starts | [ ] | [ ] | < 100 ms after recognition |
| Question: release → first audio | [ ] | [ ] | ≤ 2 s median |
| Reading: command → first chunk | [ ] | [ ] | — |

Every number in this table must come from an exported `metrics.json`; keep the file with the submission.

## Known limitations

- **Not yet proven on the phone at the time of writing:** the camera pipeline, faces, OCR and the speech queue have automated tests but are waiting on device runs ([update after the device checks]).
- **Answers take about 2.4 s to start**, over the 2 s target; Timbre REST is the largest part. Streaming TTS is the planned fix.
- **Instant alerts cover the detector's classes only** (vehicles, people, animals, furniture, and so on). Stairs, drops, potholes and open drains need a custom model; today the vision model mentions them when asked.
- **Recognition range is about 1.2 m** at the current camera resolution; 2 m needs higher-resolution frames.
- **Tamil text can't be read** (the on-device OCR has no Tamil model); Tamil speech works.
- **The camera works only while the app is open**, so the screen stays on.
- **Consent is a spoken "haan"** while the user holds the button; the app can't tell who said it.
- The full list, with plans for each, is in `LIMITATIONS.md`.

## Built with

Expo SDK 58 / React Native 0.88, VisionCamera 5, fast-tflite (LiteRT), ML Kit (faces, text), expo-sqlite; FastAPI relay on Cloud Run; Gnani Prisma and Timbre; a hosted vision model through OpenRouter. Models: EfficientDet-Lite0 (Apache-2.0), YOLO11n (AGPL-3.0), MobileFaceNet (Apache-2.0).

## Team and contributions

[Each member: name, role, what they built. Required by the contest.]

## Name

"Drishti" is a working name. Other assistive projects use it, including "Drishti Nepal" on the Play Store and Accenture's Drishti for visually impaired users in India, so [decide on a final name before any store release].
