# Drishti (दृष्टि, "sight")

Drishti is a voice-first Android assistant for blind and low-vision people in India. It watches the world through the phone camera and tells the user, out loud and in their own language, what is ahead of them: the car pulling out on the left, the friend who just walked up, the notice on the wall.

The phone hangs on a lanyard with the camera facing forward. The user doesn't need to look at the screen or tap through menus. They say **"Drishti"** or hold anywhere on the screen and speak, and Drishti answers in a few words. It is built to run on an everyday phone, including one that costs ₹5,000, and it works **alongside a cane, never instead of one**.

All speech in and out goes through Gnani AI: **Prisma** for speech-to-text and **Timbre** for text-to-speech.

## Who it's for

Blind and low-vision people in India who use an Android phone and speak any of these 11 languages: Hinglish, Hindi, English, Tamil, Bengali, Telugu, Kannada, Malayalam, Marathi, Gujarati or Punjabi.

Most assistive apps assume English and a good connection, and make you point, tap, wait and listen to a long description. Drishti is built for a busy Indian street instead: short spoken alerts, in the user's language, with the safety-critical parts running on the phone itself.

## What it does

| The user hears | What happens |
| --- | --- |
| "Kursi aage, paas" / "Car left mein" | **Hazard alerts.** Object detection on the phone finds vehicles, people, animals, furniture and other obstacles, tracks them between frames, and announces what each one is, which direction it's in and whether it's near. An object that gets close is announced again. |
| "Rahul aapke saamne hai, left mein" | **People you know.** Faces are detected and matched on the phone against people the user saved. Anyone else is only ever "unknown". |
| "Saamne kya hai?" → a short description | **Questions about the scene.** The user asks anything; the photo and question go to a vision model, and the answer is spoken sentence by sentence as it arrives. |
| A sign or notice, read aloud | **Reading.** Text is recognised on the phone (Latin and Devanagari scripts), put into reading order and read out in chunks. |
| "Isko Rahul ke naam se save karo" → "Kya aap raazi hain?" → "haan" | **Saving people, by voice and with consent.** The person is asked if they agree before their face is saved. Delete and list work the same way. |
| "Tamil mein bolo" | **Language switching**, plus stop, repeat, help and quiet mode, all by voice. |

If the camera is covered or too dark, Drishti says so, and repeats it every 20 seconds while it lasts, so the user never assumes alerts are working when they aren't.

## Architecture

```
Phone: Expo / React Native, Android                         Relay: FastAPI on Cloud Run (asia-south1)
├─ Wake word "Drishti" (Vosk, on the phone)                  ├─ /stt  WebSocket  → Gnani Prisma (streaming)
├─ Camera → YOLO11n → tracker → hazard alerts                ├─ /tts  POST       → Gnani Timbre
├─ Faces → MobileFaceNet → match against saved people        ├─ /ask  POST image + question
├─ Text recognition → reading order → chunks                 │        → vision model (OpenRouter, streamed)
├─ Voice turn → /stt → command router, or /ask               │        → split into sentences → Timbre each → SSE
└─ One speech queue with priorities → Timbre audio           └─ app token auth, rate limit, privacy-safe logs
```

**On the phone** (`app/`)

- **Camera and hazards.** VisionCamera frames go to YOLO11n (TFLite) every second frame. A tracker follows objects across frames, works out left / ahead / right and near / far from each box, and decides when something is worth saying. Each kind of object has a cooldown so the user isn't flooded.
- **Faces.** ML Kit finds faces; MobileFaceNet turns each one into a 128-number signature, which is compared with the saved signatures in SQLite. A name is spoken only when the same person wins 3 of 5 frames by a clear margin. Saving takes several frames of the largest face in view.
- **Voice.** The wake word "Drishti" (दृष्टि) is spotted on the phone by Vosk's small Hindi model, limited to a handful of words. After it, or while the screen is held, the microphone streams 16 kHz audio to the relay. The transcript goes to a keyword router that knows the commands in all 11 languages; anything that isn't a command becomes a question for `/ask`.
- **Speech.** Every line the user hears is spoken in a Gnani Timbre voice, fetched as a whole sentence and kept for the session, so a repeated alert starts instantly. A single speech queue decides what plays: a vehicle alert interrupts an answer, a name waits for the end of the current sentence, and an alert that is no longer true is dropped instead of played late.

**On the server** (`server/`)

The relay is a thin FastAPI service. It holds every API key; the app holds only a token for the relay.

- `/stt` forwards the phone's audio to Gnani Prisma over a WebSocket and returns the final transcript. Hindi and Hinglish come back transliterated into Latin script so the command router can match them.
- `/tts` turns one sentence into Timbre audio.
- `/ask` sends the photo and question to the vision model (OpenRouter, `z-ai/glm-5.3-flash`), splits the streamed answer into sentences, sends each sentence to Timbre as soon as it is complete, and streams the audio back as server-sent events. The first sentence plays while the next is still being written.

## Privacy

- **No photos are stored.** A saved person is kept only as face signatures on the phone, and only after they say yes. Deleting them removes the signatures and their name audio.
- **Nothing the user says or sees is logged**: no transcripts, questions, answers, images or names, on the phone or the server. The server's logger accepts only an allow-list of fields (timings, status codes, language), and tests check every logging call in both codebases.
- **Strangers are never identified.** A wrong name is treated as worse than "unknown".

## Repository

- `app/`: the Android app (React Native + Expo, TypeScript)
- `server/`: the relay (Python, FastAPI); `docker-compose.yml` runs it locally
- `docs/`: write-up, demo checklist, deployment notes and the video script
- `solution-pitch/`: the one-page pitch (PDF)
- [PLAN.md](PLAN.md): the build plan. [LIMITATIONS.md](LIMITATIONS.md): known gaps and what's planned for each.

## Download

The latest release APK (Android) is on the [Releases page](https://github.com/DivyanshParashar1/drishti/releases/latest). Install it, allow camera and microphone, and say "Drishti".

## Running

**App** (no Android Studio needed):

```sh
cd app
npm install
cp .env.example .env                           # set SERVER_URL / APP_TOKEN
eas build -p android --profile development   # once, and again only when native packages change
npx expo start --dev-client                    # day to day
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

**Server with Docker** (no Python or uv needed; from the repo root):

```sh
cp server/.env.example server/.env   # optional: without it the relay starts with APP_TOKEN=dev-token and no keys
docker compose up                    # relay on http://localhost:8000, reloads when server/app changes
docker compose run --rm test         # server tests in the same image (never reads server/.env)
```

`docker build -t drishti-relay server` builds the production image that Cloud Run runs (non-root, with a healthcheck).

**CI:** GitHub Actions (`.github/workflows/ci.yml`) runs the server tests, builds and smoke-tests the Docker image, and runs the app's tests and typecheck on every push and pull request. Live (credit-spending) tests never run in CI.

Deployment to Cloud Run is described in [docs/deploy.md](docs/deploy.md).

## Built with

| Package | Version | Used for |
| --- | --- | --- |
| expo | 58.0.23 | React Native 0.88.1, React 19.3.0 |
| react-native-vision-camera (+ `-worklets`, react-native-worklets 0.13.0) | 5.2.4 | Camera frames and frame processors |
| react-native-nitro-image | 0.15.2 | Frame → resized raw pixels for the models |
| react-native-fast-tflite | 3.0.1 | Running YOLO11n and MobileFaceNet (GPU enabled) |
| react-native-vision-camera-face-detector | 2.1.0 | Face detection (ML Kit) |
| @react-native-ml-kit/text-recognition | 2.0.0 | Reading text |
| react-native-vosk | 2.2.0 | Wake word |
| @siteed/audio-studio | 3.2.1 | 16 kHz mono microphone streaming |
| expo-audio / expo-sqlite / expo-file-system / expo-haptics / expo-keep-awake | SDK 58 | Playback, saved people, audio files, feedback, screen on |
| fastapi / uvicorn / httpx / websockets / pydantic-settings | 0.162.0 / 0.54.0 / 0.28.1 / 17.4 / 2.16.2 | The relay (locked in `server/uv.lock`) |

Versions were pinned on 2026-11-06; don't upgrade them mid-build.

## Models and licences

| Model | Licence | Source |
| --- | --- | --- |
| YOLO11n (object detection; fp32, 320×320 input, NMS in the app) | AGPL-3.0 | Exported with Ultralytics 8.x (`yolo export model=yolo11n.pt format=tflite imgsz=320`). Shipping it makes the app subject to AGPL-3.0 |
| MobileFaceNet (face signatures; 112×112 input, 128-number output) | Apache-2.0 (weights from [foamliu/MobileFaceNet](https://github.com/foamliu/MobileFaceNet)) | [Qualcomm AI Hub v0.66.0 TFLite float](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/mobile_facenet/releases/v0.66.0/mobile_facenet-tflite-float.zip) |
| Vosk `vosk-model-small-hi-0.22` (wake word) | Apache-2.0 | [alphacephei.com/vosk/models](https://alphacephei.com/vosk/models) |

## Licence

Drishti is released under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only), which shipping YOLO11n requires. The bundled models keep their own licences, listed above.

## Team

- **Divyansh Parashar**: ideation, coding, video recording and editing
- **Nakshatra**: ideation
