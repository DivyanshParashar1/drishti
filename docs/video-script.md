# Drishti — submission video script

**Total: about 2:55.** The demo footage you record (Part 3) is 60 seconds; everything else is built around it.

| # | Part | Length | Made by | Voice |
| --- | --- | --- | --- | --- |
| 1 | Intro | ~10–15 s | Divyansh (shoot) | Divyansh |
| 2 | Animated explainer: the problem and the idea | ~29 s | Claude | Yashraj (Timbre v3.0) |
| 3 | Demo: 7 features, each after a title card | 60 s footage + 14 s cards | You shoot; Claude adds cards and captions | Drishti (Shivani) and the user |
| 4 | How it works: two paths, offline and online | ~62 s | Claude | Yashraj |
| 5 | Credits | ~5 s | Claude | — |

The video is in English. Three voices, so viewers always know who is talking: Divyansh (Part 1), the app's own voice Shivani (Part 3), and the narrator Yashraj (Parts 2 and 4).

---

## How to shoot (Parts 1 and 3)

- **Android screen recorder, "Device audio and microphone".** Device audio records Drishti's voice cleanly; the microphone picks up what you say. Turn on the debug overlay (triple-tap) so boxes, names and transcripts show.
- **Phone vertical, at chest height**, as the glasses would be. Keep it steady.
- **Release APK** (not the dev build), and warm up the server first (`/health`).
- **One clip per feature**, with a few seconds of slack at each end. Name the files `1_intro.mp4`, `3_1_hazard.mp4`, `3_2_faces.mp4`, `3_3_save.mp4`, `3_4_ask.mp4`, `3_5_read.mp4`, `3_6_language.mp4`, `3_7_wake.mp4`, all in one folder.
- **Do another take** if Drishti mishears. A clean take beats a long one.
- **Optional:** a second phone filming over the shoulder (user, cane, scene). Claude can show it side by side with the screen.

---

## Part 1 — Intro (~10–15 s) · you shoot

The whole video is in **English**. Only the voice commands in the demo are in Hindi or Hinglish, with English captions.

**Setup:** Divyansh to camera (selfie or front camera), plain background, good light.

| Time | Audio |
| --- | --- |
| 0–4 s | **Divyansh:** "Hi, I'm Divyansh, and together with Nakshatra, I built Drishti." |
| 4–12 s | **Divyansh (the one-liner):** "Drishti is an app that sees for blind people and tells them what's around them, in their own language." |
| cut | Straight to Part 2 |

Other one-liners, if you prefer:
- "Drishti turns your phone into a pair of eyes that speaks your language."
- "Drishti watches the road for blind people, and tells them what's ahead, in Hindi, Tamil, English and eight more languages."


---

## Part 2 — Animated explainer (~29 s) · Claude · **rendered**

The phone hangs on a lanyard on the chest, camera facing the world (no glasses). The point to land: Drishti is designed to run even on a ₹5,000 phone; light on-device models do the work, not costly hardware.

| Time | Visual | Narration (Yashraj) |
| --- | --- | --- |
| 0–4.6 s | A figure walking with a white cane; the cane's sweep lights up the ground | "A white cane finds what's at your feet." |
| 4.8–11 s | A car, a friend walking up and a notice on a wall light up one by one, beyond the cane's reach | "But not the car pulling out on your left. Not the friend who just walked up. Not the notice on the wall." |
| 11.6–16.2 s | A phone drops onto the chest on a lanyard; a camera cone sweeps forward and puts detection boxes on the car, "Nakshatra" and the notice | "With Drishti, a phone hangs around your neck, its camera facing the world." |
| 16.2–23 s | Close-up of the phone with a yellow **₹5,000** tag; "Any Android phone · Light on-device models · No special hardware" | "It's designed to run even on a five-thousand-rupee phone. Light models do the work, not expensive hardware." |
| 23–29 s | Speech bubbles in Hindi, English, Tamil, Bengali, Telugu and Kannada | "It watches the road with you, and tells you what's there, in your own language." |

---

## Part 3 — Demo (60 s of footage) · you shoot, Claude adds title cards

Each clip follows a two-second title card (the feature name, plus one line). Aim for about 8–9 s per clip; 3.3 can run to about 15 s if the others are shorter.

| # | Title card | Line under it | What to shoot | Must be heard or seen |
| --- | --- | --- | --- | --- |
| 3.1 | **Instant hazard alerts** | Fully offline | Pull down the shade and turn **airplane mode on** (in the shot), then walk towards a chair | "Kursi aage, paas" plays instantly; the OFFLINE badge |
| 3.2 | **Knows your people** | Only with their spoken consent | A saved person walks up; then someone **not** saved | "Nakshatra aapke saamne hai, left mein" / "Koi anjaan vyakti saamne hai" |
| 3.3 | **Save someone by voice** | No screen, no typing | "Isko Rahul ke naam se save karo" → "Kya aap save hone ke liye raazi hain?" → the person says "Haan" → "Teen second camera ki taraf dekhiye" → "Save ho gaya" | The whole consent exchange |
| 3.4 | **Ask anything** | Answers in about two seconds | Hold the screen: "Saamne kya hai?" (point at a door, stairs, or a table with objects) | The spoken answer; the transcript on the overlay |
| 3.5 | **Reads signs aloud** | Hindi and English | "Ye padho" at a printed Hindi sign, 30–40 cm away, well lit | The sign in frame, read aloud |
| 3.6 | **Speaks your language** | Hinglish + 10 Indian languages | "Tamil mein bolo", then ask anything | The answer in Tamil |
| 3.7 | **Hands-free** | Just say its name | Say "Drishti" without touching the phone, then ask a question | Drishti responds; nobody touches the phone |

**English captions** for every Hindi line, for example: "Chair ahead, close" · "Nakshatra is in front of you, on the left" · "An unknown person is in front of you" · "Save this person as Rahul" · "Do you agree to be saved?" · "Yes" · "Look at the camera for three seconds" · "Saved" · "What's in front?" · "Read this" · "Speak in Tamil".

**Shoot in this order** (most important first): 3.1 → 3.2 → 3.4 → 3.5 → 3.3 → 3.6 → 3.7.

---

## Part 4 — How it works (~55 s) · Claude

Animated diagram, rendered (61.5 s). Vertical layout: the cloud panel on top (Prisma › Vision › Timbre), the phone panel below (Mic; Camera › On-device models › Speaker), so the fast lane runs inside the phone and the slow lane loops up through the cloud and back down to the shared speaker.

| Time | Visual | Narration (Yashraj) |
| --- | --- | --- |
| 0–5 s | Title "How Drishti works"; two clocks appear, one fast and one slow | "So how does Drishti work? It thinks on two clocks." |
| 5–20 s | **Fast lane** lights up inside the phone: camera → on-device models → a speaker icon; a "no Wi-Fi" icon stays lit. Label: *"Fast path: on the phone, offline"* | "The fast path never leaves the phone. On-device models spot cars, chairs and people, and recognise saved faces. Alerts play instantly from clips we made in advance with Gnani Timbre, so even offline, Drishti speaks in Gnani's voice." |
| 20–33 s | **Slow lane**: mic → cloud → **Prisma** → vision model → **Timbre** → back to the phone. Label: *"Slow path: Prisma → vision model → Timbre, ~2 s"* | "The slow path goes to the cloud. Gnani Prisma turns your question into text as you speak, a vision model looks at the scene, and Timbre speaks the answer back, sentence by sentence, in about two seconds." |
| 33–45 s | Both lanes merge into a single speaker; a car alert cuts in ahead of an answer. Labels: *"Hazards interrupt"* · *"Name clips cached offline"* · *"Internet lost → announced; alerts keep running"* | "Both paths share one voice, and a hazard always cuts in first. Saved names are spoken once by Timbre and kept on the phone. If the internet drops, Drishti says so, and the alerts keep running." |
| 45–51 s | Icons: crossed-out camera roll, crossed-out log file, a white cane | "No photos are stored, nothing you say is logged, and Drishti works alongside a cane, never instead of one." |
| 51–55 s | The Gnani Timbre name appears | "Oh, and this voice you've been hearing? *(pause)* That's Gnani Timbre too." |

---

## Part 5 — Credits (~5 s) · Claude

**Drishti**
Divyansh Parashar — [role] · Nakshatra — [role]
Built on Gnani AI **Prisma v3.0** (speech-to-text) and **Timbre v3.0 / v2.5** (text-to-speech)
github.com/DivyanshParashar1/drishti
#GreatIndianAIInternshipChallenge #GnaniAI

---

## Production notes for Claude

- Narration: Timbre v3.0, voice **Yashraj**, `language: en-IN`, WAV 24 kHz; one request per sentence (≤ 200 characters). `<pauses>` is a valid v3.0 audio tag. Listen for how "Gnani" is pronounced; respell it if needed.
- The animation: Pillow frames → ffmpeg, 1080×1920 vertical to match the phone footage (or 1080×1080 if mixed). Dark background, one accent colour, large text.
- Title cards: 2 s each, with the feature name large and the line under it smaller.
- Captions: burned in (LinkedIn autoplays muted). The app's speech is in white, the user's in yellow, the narrator's in no caption box (the on-screen labels carry it).
- Audio: normalise the phone clips to the same loudness as the narration (`loudnorm`); a short crossfade between parts.
- Export: H.264 / AAC MP4, under 5 GB and 10 minutes (LinkedIn limits).

## Where things are

- Generators: `scripts/video/narrate.py` (Timbre narration; one request at a time, Timbre rejects concurrent requests; lines over ~8 s get cut, so keep them short) and `scripts/video/render.py` (all animation; needs `brew install libraqm` and `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib` for Indic text).
- Rendered parts: `~/Desktop/drishti-video/rendered/` and `~/Movies/drishti-video/` (Edits is sandboxed and only reads from ~/Movies).
- Edits project **"Drishti submission"**: Part 2 → the seven title cards → Part 4 → credits. Put your clips in `~/Movies/drishti-video/` so the demo clips can go in after each card and the intro at the start.
- Credits roles: re-render with `ROLES="role1|role2" python3 render.py OUT part5`.
