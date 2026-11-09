# Drishti demo UI: design brief

This is a brief for designing the app's default on-screen UI (spec item F12). It covers what the app is, who looks at the screen, the constraints, the design tokens, every screen and state, and the copy.

## 1. Context

Drishti is an Android app for blind and low-vision people. It uses the phone camera to see what is ahead and says it aloud in Hinglish, Hindi, English or Tamil. It is the software for a pair of smart glasses, running on a phone worn on the chest. It works alongside a white cane, never instead of one.

What it does, all by voice:

- **Obstacle alerts**, on device, offline: "Kursi aage, paas" (chair ahead, close). Vehicles, people, animals, furniture, steps.
- **Faces**: names people who were saved with their consent ("Rahul aapke saamne hai, left mein"). Anyone else is "unknown".
- **Ask**: hold the screen, ask "Saamne kya hai?" (what's ahead?) and hear a streamed answer from a vision model.
- **Read**: "Ye padho" (read this) reads printed text (signs, notices) aloud, paragraph by paragraph.
- **Commands**: stop, next, repeat, quiet mode, change language, save/delete/list people, help.

**The user never sees the screen.** Today the screen shows only the camera feed, and the whole screen is an invisible hold-to-talk button. The demo UI exists for **sighted viewers**: people watching the demo video (which autoplays muted on LinkedIn and X), judges, and anyone standing next to the user. They should understand at a glance what Drishti sees, what it just said, and how fast it said it.

The demo UI is the **default**. A **real-user mode** (section 6.10) strips it back to a plain dark screen for daily use.

## 2. Design goals

1. **Readable in a muted, compressed video.** Someone watching a 1080p phone recording on LinkedIn, often at small size, can read the captions and see the boxes.
2. **Shows that it is fast and works offline.** Latency numbers and the online/offline state are always visible.
3. **Never gets in the user's way.** The visible chrome must not change what the blind user's hands do: holding anywhere still means talk.
4. **Honest.** It shows only real values the app measured or produced: no fake numbers, no animations that suggest work that isn't happening.
5. **Looks like glasses software.** It should feel like a heads-up display on a camera feed, not a phone app with a camera inside it.

## 3. Hard constraints

- **Platform**: Android, phone, **portrait only**. React Native (Expo). Reference frame **412 × 915 dp** (Pixel 7 class); also check **360 × 800 dp**. Status bar visible (light icons); gesture nav bar at the bottom.
- **Full-bleed camera feed** behind everything. Its content is arbitrary (bright sky, dark corridor), so every text element sits on its own scrim or carries a strong shadow.
- **Dark only.** No light theme.
- **Scripts**: Devanagari (Hindi), Latin (English, romanised Hinglish), Tamil. Tamil and Devanagari lines run longer and taller than Latin; every text slot must fit all three. Fonts: **Noto Sans**, **Noto Sans Devanagari**, **Noto Sans Tamil**; numbers in a monospace (**Noto Sans Mono** or **JetBrains Mono**).
- **Input model, unchanged**: press and hold anywhere = talk; release = send. Under TalkBack: double-tap to start, double-tap again to send. Triple-tap anywhere toggles the existing **debug overlay** (an engineer panel; keep it, don't redesign it). The new temple strips (6.3) add input only on the left and right edges.
- **Nothing tappable in the middle of the screen.** No buttons, chips or links there that a hand could hit by accident.
- **Performance**: the camera runs a detector at camera frame rate. Overlays should be simple shapes and text: no blur (`BlurView` is expensive on Android), no heavy shadows. Use solid or alpha scrims.
- **Safe area**: keep text 16 dp from the screen edges and clear of the status bar and nav bar.

## 4. Design tokens (starting point, adjust freely)

### Colour

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#000000` | Behind the camera; real-user mode |
| `scrim` | `rgba(0,0,0,0.72)` | Caption panel, status strip, latency card |
| `scrim-light` | `rgba(0,0,0,0.45)` | Temple strips at rest |
| `text` | `#FFFFFF` | Primary text |
| `text-2` | `#C7C7CC` | English line, secondary labels |
| `text-3` | `#8E8E93` | Hints, units |
| `brand` | pick one | Wordmark and listening state. Suggest a warm saffron (around `#FFB020`) or a teal; it must not be confused with the alert colours below |
| `alert-far` | `#FFD400` | Detection, far (caution) |
| `alert-near` | `#FF3B30` | Detection, near; urgent alerts (vehicle near, step/drop) |
| `known` | `#34C759` | Recognised saved person |
| `unknown` | `#8E8E93` | Person not recognised (dashed outline) |
| `listen` | `brand` | Listening glow, mic waveform |
| `offline` | `#FF9F0A` | OFFLINE badge |
| `online` | `#30D158` | Online dot |

All text on `scrim` must reach WCAG AA (4.5:1). Alert colours must not be the only signal: pair them with words (NEAR / FAR) or shape (solid vs dashed).

### Type (sp)

| Token | Size / weight | Use |
| --- | --- | --- |
| `caption-1` | 26 / 600 | Spoken line (native script) |
| `caption-2` | 18 / 400 | English line |
| `label` | 13 / 600, caps, +0.5 letter-spacing | Chips, badges, box labels |
| `mono` | 13 / 500 | Latency numbers |
| `mono-lg` | 22 / 600 | The hero latency number |
| `title` | 20 / 700 | Permission and first-run screens |

### Shape and motion

- Corner radius 12 dp (panels), 999 (chips), 4 dp (detection boxes).
- Box stroke 2 dp far, 3 dp near.
- Motion durations: caption in 150 ms, out 250 ms; alert pulse 300 ms; listening glow loops at 1.2 s. Motion supports a state change and never loops while nothing is happening.

## 5. Layout (portrait, top to bottom)

```
┌──────────────────────────────────────┐
│ status bar (system)                  │
│ ┌──────────────────────────────────┐ │
│ │ STATUS STRIP                     │ │  wordmark · lang · online · mode chips · voice state
│ └──────────────────────────────────┘ │
│                     ┌──────────────┐ │
│ ▌                   │ LATENCY CARD │▐│
│ ▌                   └──────────────┘▐│
│ ▌                                   ▐│
│ ▌       camera feed + boxes         ▐│  ▌ left temple: HOLD TO TALK
│ ▌                                   ▐│  ▐ right temple: TAP REPEAT · 2× STOP
│ ▌                                   ▐│
│ ▌   ┌───────────────────────────┐   ▐│
│ ▌   │ "You: saamne kya hai?"    │   ▐│  transcript bubble (only after speaking)
│ ▌   └───────────────────────────┘   ▐│
│ ┌──────────────────────────────────┐ │
│ │ [ALERT]  कुर्सी आगे, पास           │ │  CAPTION PANEL: line 1 spoken, line 2 English
│ │          Chair ahead, close      │ │
│ └──────────────────────────────────┘ │
│ nav bar (system)                     │
└──────────────────────────────────────┘
```

## 6. Components and states

### 6.1 Status strip (top)

One row on `scrim`, full width minus 16 dp margins, about 44 dp tall.

- **Wordmark**: "Drishti" (or दृष्टि), small, in `brand`.
- **Language chip**: `HINGLISH` / `हिंदी` / `ENGLISH` / `தமிழ்`. Flashes for 300 ms when changed by voice.
- **Connectivity badge**: green dot + `ONLINE`, or an airplane icon + `OFFLINE · ALERTS ON DEVICE` in `offline`. A neutral `…` while checking. This is a key demo moment (alerts keep working in airplane mode), so the offline state must be obvious.
- **Mode chips**, shown only when active: `QUIET` (only vehicles and near objects are announced), `READING 2/5` (chunk of chunks), `SAVING…` (enrolment dialog running), `FACES OFF`.
- **Voice state** at the right end: idle (nothing or a small mic glyph), `LISTENING` (brand, pulsing dot), `THINKING` (while waiting for the answer).
- When the phrase pack is still downloading for the current language: a thin progress bar under the strip and `Voice pack 34/61`. When it's done, it disappears.

If the row overflows on 360 dp, the mode chips drop to a second row; the wordmark goes first.

### 6.2 Detection boxes (on the camera feed)

Always on in demo mode. Simpler than the debug overlay: no track ids or raw scores.

- **Object, far**: `alert-far` outline 2 dp; label tag above the box's top-left: `CHAIR · AHEAD · FAR` (English, caps). Optionally a second smaller line with the spoken word (`कुर्सी`).
- **Object, near**: `alert-near` outline 3 dp, tag `CHAIR · AHEAD · NEAR`. When the alert for it is spoken, the box pulses once.
- **Known person**: `known` outline; tag with the **name** large: `RAHUL · LEFT`.
- **Unknown person**: `unknown`, dashed outline; tag `UNKNOWN`.
- **Person whose face is too small to recognise yet**: plain person box, tag `PERSON`.
- Only classes Drishti announces get boxes (vehicles, people, animals, furniture, etc.), not everything the detector sees.
- Tags must stay on screen: if a box touches the top, put the tag inside it.

### 6.3 Temple strips (left and right edges)

Two tall narrow strips, like the arms of glasses, about 48 dp wide, running from below the status strip to above the caption panel. At rest they are subtle (`scrim-light`, a few short horizontal ridges like a touch pad texture, a small vertical label). They are real buttons.

- **Left temple: HOLD TO TALK.** The same as holding anywhere else, but it gives viewers a visible place where talking starts. While held: it fills with `listen`, shows a live mic waveform, and the screen edge gets a soft `listen` glow.
- **Right temple: TAP = REPEAT, DOUBLE-TAP = STOP.** Tap replays the last thing said; double-tap stops all speech. A short ripple on press. Show `↻ REPEAT` or `■ STOP` for 600 ms as feedback.
- TalkBack: each strip is its own button with its own label ("Talk to Drishti", "Repeat. Double tap twice to stop"). The middle stays the existing whole-screen talk button.
- Show the gesture labels small and vertical (rotated 90°) in the strip, so they don't look like decoration.

### 6.4 Latency card (top right, under the strip)

A small card on `scrim` with **measured numbers only**. Values come from the app's metrics (rolling p50/p95 per stage).

- Hero line: the most recent event's latency in `mono-lg`, with its kind: `ALERT 38 ms` (frame captured → sound playing), `NAME 210 ms`, `ANSWER 1.4 s` (release → first sentence playing), `READ 0.9 s`.
- Second line: `p50 41 · p95 77 ms` for that kind.
- A tiny label `on device` for alerts and names, `cloud` for answers, so viewers see which path ran.
- Before the first event: `—` with "waiting for first alert".
- Tap does nothing (it is in the no-tap zone's edge; keep it non-interactive).

### 6.5 Caption panel (bottom)

The main element for a muted video. On `scrim`, full width minus 16 dp margins, above the nav bar.

- **Source tag** on the left: `ALERT` (alert colour, red if near/urgent), `NAME` (green), `ANSWER` (brand), `READING` (white), `SYSTEM` (grey).
- **Line 1**: exactly what Drishti is saying, in the current language's script (Devanagari for Hindi, romanised for Hinglish, Tamil script for Tamil, English for English). `caption-1`.
- **Line 2**: the English meaning in `text-2`, `caption-2`. Hidden when the language is English (it would repeat line 1).
- **Answers stream**: sentences appear as they are spoken. Show the current sentence in full white and the previous one dimmed above it (max 2 sentences; older ones scroll away).
- **Reading**: show the chunk being read; the English line is hidden (OCR text has no translation), and a small `para 2 · chunk 3/5` appears in the tag row.
- Captions stay 6 s after speech ends, then fade. A new utterance replaces the old one at once.
- **Interruption**: when an urgent alert cuts in during an answer, the answer caption collapses (strike-through or slide away) and the alert caption takes its place with a red flash on the panel's border. This is a demo moment.
- Max 3 lines for line 1 at 412 dp; truncate earlier sentences, never the current one.

### 6.6 Transcript bubble

After the user speaks, a bubble above the caption panel: `You: "saamne kya hai?"`, with what the command router did: `→ describe`, `→ read`, `→ save "Priya"`, `→ stop`. If nothing was heard: `Didn't catch that`. Fades with the caption.

### 6.7 Listening and thinking

- **Listening** (while held): edge glow in `listen`, left temple filled, waveform, status `LISTENING`. Any caption in progress dims (speech is paused while listening).
- **Thinking** (released, waiting for the server): status `THINKING`; the caption shows the "Let me look" phrase ("Dekh rahi hoon"). A slim indeterminate bar on top of the caption panel.

### 6.8 Enrolment (saving a person by voice)

A guided dialog driven only by voice. The UI mirrors each step.

1. `ask_name`: caption "Naam bataiye / Please say the name". Status chip `SAVING…`.
2. `consent`: the person to be saved must say yes. Caption "Kya aap save hone ke liye raazi hain? / Do you agree to be saved?" plus a badge **`CONSENT NEEDED`**. Make consent visible; it is a privacy point in the video.
3. `capturing`: "Teen second camera ki taraf dekhiye / Please face the camera for three seconds". The face box gets a 3-second **countdown ring**.
4. Done: green tick on the box and the tag changes to the name; caption "Save ho gaya / Saved".
5. Failure: "Chehra saaf nahi dikha / I couldn't see the face clearly"; cancelled: "Theek hai, save nahi kiya / Okay, not saved".

### 6.9 System states

| State | Visual |
| --- | --- |
| Offline | Badge `OFFLINE · ALERTS ON DEVICE`; boxes and alerts continue. Asking a question gives caption "Internet nahi hai / No internet" |
| Internet lost / back | A one-line toast under the strip for 3 s |
| Camera blocked (hand over lens, too dark) | Camera area dimmed, centred icon (eye with a slash) and caption "Camera saaf nahi dikh raha / The camera can't see clearly" |
| Detector failed | Caption in red, `SYSTEM` tag: "Obstacle alerts could not start. Please reopen the app." Status strip shows a red `ALERTS OFF` chip |
| Quiet mode | `QUIET` chip; far, non-vehicle boxes drawn at 40% opacity (they are seen but not announced) |
| Models loading (first ~1 s) | `Starting…` chip in the strip; no boxes yet |
| Language changed | Language chip flashes; caption "I'll speak in English now" |

### 6.10 Real-user mode

For daily use by a blind user: a plain black screen. The camera keeps running (the app needs its frames), but the preview is covered, nothing is drawn, and it uses less battery.

- The whole screen is still hold-to-talk; the temple strips keep working but aren't drawn.
- Only element: a very dim "Drishti" wordmark in the centre (`text-3` at 30%), so a sighted helper knows the app is running.
- **Switching**: by voice ("demo mode band karo" / "demo mode chalu karo", "demo mode off/on") or a **two-finger long press (2 s)** anywhere. The choice is saved. Spoken confirmation, plus a 1-second toast `DEMO MODE ON` / `OFF`.
- Triple-tap still opens the debug overlay in both modes.

### 6.11 Permission screens

Before the camera/mic are granted. Black background, centred, `title` + one line of body + one large full-width button (this is the only screen with a normal button):

- Camera: "Drishti needs the camera to see what's ahead." → `Allow camera`.
- Microphone: "Drishti needs the microphone to hear your questions." → `Allow microphone`.
- Denied permanently: "Open Settings and allow the camera." → `Open settings`.
- Each screen's text is also spoken.

### 6.12 First run

Plays once: welcome, the cane line, then a ~30 s voice tutorial (7 lines). The camera runs underneath. The caption panel steps through each line (with English) and shows progress dots (`●●○○○○○`). The cane line ("Drishti works with your cane, not instead of it") gets a slightly larger treatment: it's the safety message.

## 7. Screens to deliver

Frames at 412 × 915 dp, dark, over a realistic camera photo (Indian street or corridor: footpath, autos, a chair, a person). Number them so engineering can match them:

1. Live, idle: strip, latency card, temples, a couple of far boxes, no caption.
2. Alert, near: red box pulsing, `ALERT` caption "Kursi aage, paas / Chair ahead, close", latency `ALERT 38 ms`.
3. Known person: green box `RAHUL · LEFT`, `NAME` caption.
4. Unknown person: dashed grey box, caption "Koi anjaan vyakti saamne hai / An unknown person is ahead".
5. Listening: left temple held, edge glow, waveform.
6. Thinking: `THINKING`, "Dekh rahi hoon / Let me look".
7. Answer streaming (Hindi, Devanagari): two sentences, English lines, latency `ANSWER 1.4 s · cloud`.
8. Urgent alert interrupting an answer.
9. Reading a Hindi sign: `READING 2/5`, chunk shown, no English line.
10. Enrolment, consent step, with `CONSENT NEEDED`.
11. Enrolment, capturing, with the countdown ring.
12. Offline (airplane): badge, an alert still firing, latency still shown.
13. Camera blocked.
14. Tamil: language chip `தமிழ்`, Tamil caption with English line (check fit).
15. Quiet mode.
16. Real-user mode (black).
17. Mode-switch toast.
18. Permission: camera.
19. First run: the cane line.
20. 360 dp width check of frame 7 (the longest content).

Also deliver: a component sheet (strip, chips, badges, box tags for each kind, caption panel per source, temple strips at rest/pressed, latency card), and the tokens table above with your final values.

## 8. Copy reference

Fixed phrases with their English line (Hinglish shown; Hindi and Tamil have the same English):

| Key | Spoken (Hinglish) | English line |
| --- | --- | --- |
| alert | `<object> <dir> <dist>`, e.g. "Kursi aage, paas" | "Chair ahead, close" |
| dir | left mein / aage / right mein | on the left / ahead / on the right |
| dist | paas / door | close / far |
| unknown person | Koi anjaan vyakti saamne hai | An unknown person is ahead |
| step | Aage seedhi ya girav | Step or drop ahead |
| looking | Dekh rahi hoon | Let me look |
| didn't hear | Samajh nahi aaya, dobara boliye | Sorry, I didn't catch that. Please say it again. |
| no internet | Internet nahi hai | No internet |
| internet lost | Internet chala gaya, alerts chalu hain | Internet lost. Alerts are still on. |
| internet back | Internet wapas aa gaya | Internet is back |
| camera blocked | Camera saaf nahi dikh raha | The camera can't see clearly |
| quiet on | Shaant mode chalu… | Quiet mode on. I'll only announce vehicles and things close by. |
| ask name | Naam bataiye | Please say the name |
| consent | Kya aap save hone ke liye raazi hain? | Do you agree to be saved? |
| hold | Teen second camera ki taraf dekhiye | Please face the camera for three seconds |
| saved / deleted | Save ho gaya / Delete ho gaya | Saved / Deleted |
| no text | Koi text nahi dikh raha… | I can't see any text. Hold the phone steady. |
| reading done | Bas itna hi likha hai | That's all the text |
| welcome | Namaste, main Drishti hoon… | Hello, I am Drishti. I will tell you what is around you. |
| cane | Drishti aapki cane ke saath kaam karta hai, uski jagah nahi. | Drishti works with your cane, not instead of it. |

Object words include: person, bicycle, car, motorbike, bus, truck, dog, cow, chair, bench, sofa (the full list is in `app/src/audio/clips.generated.ts`).

## 9. Out of scope for design

- The debug overlay (triple-tap engineer panel) stays as is.
- Settings screens: there are none; everything is voice.
- Light theme, tablets, landscape, iOS.

## 10. Engineering notes (for after the design)

- **English line for answers**: the server's `/ask` prompt will ask the vision model for each sentence plus an English gloss, and each SSE sentence event will carry both. Fixed phrases already have their English in `clips.generated.ts` (`en` field).
- Captions need a small event bus from the audio scheduler (what is playing now, its source, its English).
- Real-user mode: a saved setting, a voice command in the router, and a two-finger long-press detector that doesn't start a talk.
- The right temple's taps must not count towards the triple-tap debug gesture.
- PLAN.md lists F12 as having no phase; this becomes that phase.
