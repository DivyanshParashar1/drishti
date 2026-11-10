# Drishti — submission video script

Target: **2:30–3:00 in total.** The demo footage you record (Part 3) is **60 seconds**; everything else is added around it.

| # | Part | Length | Made by | Voice |
| --- | --- | --- | --- | --- |
| 1 | Intro | ~15 s | Divyansh and Nakshatra (shoot) | You two |
| 2 | Animated explainer: the problem and the idea | ~25 s | Claude (animation and Timbre narration) | Yashraj (Timbre v3.0) |
| 3 | Demo: 7 features, each with a title card | 60 s of footage (+ ~2 s per title card) | You (shoot); Claude adds the cards and captions | Drishti (Shivani) and the user |
| 4 | How it works: two latency paths, offline and online | ~50 s | Claude (animation and Timbre narration) | Yashraj |
| 5 | Credits card | ~5 s | Claude | — |

Three voices, so viewers always know who is talking: you (Part 1), the app's own voice Shivani (Part 3), and the narrator Yashraj (Parts 2 and 4).

---

## How to shoot (Parts 1 and 3)

- **Use Android's built-in screen recorder with "Device audio and microphone".** Device audio records Drishti's voice cleanly; the microphone picks up what you say. Turn on the debug overlay (triple-tap) so boxes, names and transcripts are visible.
- **Optional extra angle:** a second phone filming over the shoulder (the user, the cane, the scene). If you have both, I'll show them side by side. Screen recordings alone are enough.
- **One clip per feature.** Name the files `1_intro.mp4`, `3_1_hazard.mp4`, `3_2_faces.mp4` and so on, and put them in one folder. A few seconds of slack at each end is fine; I'll trim.
- **Holding the phone:** vertical, at chest height, as the glasses would be. Keep it steady.
- **Before each take:** warm the server (`/health`) and use the release APK, not the dev build. Airplane mode only for the offline clip.
- **Do another take if** Drishti mishears. A clean take beats a long one.

---

## Part 1 — Intro (~15 s) · you shoot

**Setup:** demo menu → front camera on. Save both of you beforehand ("Isko Divyansh ke naam se save karo", then the same for Nakshatra).

| Time | On screen | Audio |
| --- | --- | --- |
| 0–3 s | Front camera, both of you in frame, name boxes appear | **Drishti:** "Divyansh aapke saamne hai… Nakshatra aapke saamne hai" |
| 3–15 s | Same shot | **Divyansh:** "Haan! Main Divyansh, aur ye hai Nakshatra." **Nakshatra:** "Aur ye hai Drishti: ek app jo blind logon ke liye dekhti hai, aur unki bhasha mein bolti hai." |

English captions (I'll add them): "Yes! I'm Divyansh, and this is Nakshatra." / "And this is Drishti: an app that sees for blind people, and speaks their language."

If both names don't come out cleanly in one take, one person is enough. Drishti naming either of you is the hook.

---

## Part 2 — Animated explainer (~25 s) · Claude makes it

Motion graphics: a figure walking with a cane, then the hazards a cane can't detect light up one by one, then the phone (and glasses) with Drishti's logo.

**Narration (Yashraj):**
> A white cane finds what's at your feet. <pauses> But not the car pulling out on your left, the friend who just walked up, or the notice on the wall.
> Drishti is the software for smart glasses, running today on any Android phone. It watches the road with you, and tells you what's there, in your own language.

---

## Part 3 — Demo (60 s of footage) · you shoot, Claude adds title cards

Each clip gets a two-second title card first (feature name plus one line); the cards don't count towards the 60 s. Aim for about 8–9 s per clip (7 clips ≈ 60 s); 3.3 (save by voice) can run to ~15 s if the others are shorter.

| # | Title card | One line under it | What to shoot | Must be heard or seen |
| --- | --- | --- | --- | --- |
| 3.1 | **Instant hazard alerts** | Fully offline | Pull down the shade and turn **airplane mode on** (keep it in the shot), then walk towards a chair | "Kursi aage, paas" plays instantly; the OFFLINE badge |
| 3.2 | **Knows your people** | Only with their spoken consent | A saved person walks up; then someone **not** saved | "Nakshatra aapke saamne hai, left mein" / "Koi anjaan vyakti saamne hai" |
| 3.3 | **Save someone by voice** | No screen, no typing | "Isko Rahul ke naam se save karo" → "Kya aap save hone ke liye raazi hain?" → the person says "Haan" → "Teen second camera ki taraf dekhiye" → "Save ho gaya" | The whole consent exchange |
| 3.4 | **Ask anything** | Answers in about two seconds | Hold the screen: "Saamne kya hai?" (point at something worth describing: a door, stairs, a table with objects) | The spoken answer; the transcript on the overlay |
| 3.5 | **Reads signs aloud** | Hindi and English | "Ye padho" at a printed Hindi sign, 30–40 cm away, well lit | The sign in frame; Drishti reading it |
| 3.6 | **Speaks your language** | Hinglish + 10 Indian languages | "Tamil mein bolo", then ask anything | The answer in Tamil |
| 3.7 | **Hands-free** | Just say its name | Say "Drishti" without touching the screen, then ask a question | Drishti responds with nobody touching the phone |

Shoot in this order, so the most important ones are done first: 3.1, 3.2, 3.4, 3.5, then 3.3, 3.6, 3.7.

---

## Part 4 — How it works (~50 s) · Claude makes it

Animated diagram: the phone on the left, the cloud on the right, two lanes between them: a fast lane that stays on the phone, and a slow lane out to the cloud and back.

**Narration (Yashraj):**
> So how does Drishti work? It thinks on two clocks.
> **The fast path never leaves the phone.** Models on the phone spot cars, chairs and people many times a second, and recognise saved faces. Alerts play instantly from voice clips we made in advance with Gnani Timbre, so even with no internet, Drishti speaks in Gnani's voice.
> **The slow path goes to the cloud,** when you ask something. Gnani Prisma turns your speech into text as you speak. A vision model looks at the scene, and Gnani Timbre speaks the answer back, sentence by sentence, in about two seconds.
> **The two paths share one voice.** A car alert always cuts in ahead of an answer. When someone is saved, their name is spoken by Timbre once, and the clip is stored on the phone, so recognising them works offline. If the internet drops, Drishti tells you, and keeps the alerts running.
> No photos are stored. Nothing you say is logged. And Drishti works alongside a cane, never instead of one.
> Oh, and this voice you've been hearing? <pauses> That's Gnani Timbre too.

On-screen labels: "Fast path: on the phone, offline" · "Slow path: Prisma → vision model → Timbre, ~2 s" · "Hazards interrupt" · "Name clips cached offline" · "Internet lost → announced; alerts keep running".

---

## Part 5 — Credits (~5 s)

**Drishti** · Divyansh Parashar ([role]) · Nakshatra ([role])
Built on Gnani AI **Prisma v3.0** (speech-to-text) and **Timbre v3.0 / v2.5** (text-to-speech)
github.com/DivyanshParashar1/drishti · #GreatIndianAIInternshipChallenge #GnaniAI
