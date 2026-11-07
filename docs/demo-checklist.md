# Demo shot list

For whoever films the 60-second and ~3-minute videos. Videos autoplay muted on LinkedIn and X, so every shot needs the action readable on screen: turn the debug overlay on (triple-tap anywhere), and add captions in editing for what Drishti says.

## Before filming

- [ ] Server deployed and warm: run the three `/health` calls from `docs/deploy.md` a minute before each take.
- [ ] Preview APK installed (not the dev build): no dev menu and no Metro.
- [ ] Clip packs generated (X-4.1, X-4.2) so alerts play Timbre clips, not the phone's voice.
- [ ] Two people saved by voice, with their name clips fetched (overlay: `saved: Name(8 ♪)`). Both have agreed to appear on camera.
- [ ] A third person, not saved, who has agreed to appear as the "stranger".
- [ ] A printed A4 sign in Hindi (large font, at least 16 pt) and a short English one.
- [ ] Phone volume at maximum, on a chest mount or held at chest height, as the glasses would be.
- [ ] A safe location: an indoor corridor or quiet courtyard. A sighted helper stands next to the user in every shot, and the cane is visible.
- [ ] A second phone or camera filming over the shoulder, so the screen and the scene are both in frame.
- [ ] After the last take: overlay → Export metrics. Keep the JSON; the write-up's numbers come from it.

## 60-second cut (spec §11 storyboard)

| # | Time | Shot | Setup | What must be visible |
| --- | --- | --- | --- | --- |
| 1 | 0–6 s | Title over the user walking with the cane, phone on the chest | — | "Drishti: the glasses' software, running on a phone" |
| 2 | 6–14 s | A saved friend walks up and is named: "Rahul aapke saamne hai, left mein" | Faces on; friend 1–1.5 m away, facing the camera | Name tag on the overlay box; caption |
| 3 | 14–20 s | The stranger walks up: "Koi anjaan vyakti saamne hai" | Stranger never saved | "unknown" on the box |
| 4 | 20–28 s | **Airplane mode ON** (pull down the shade to show it), then a chair ahead: "Kursi aage, paas" plays instantly | Chair 1.5 m ahead | Airplane icon, OFFLINE badge, reflex p50 on the overlay |
| 5 | 28–40 s | Airplane mode off. Hold the screen: "Saamne kya hai?" → a Hindi answer | Online; a scene with something worth describing (stairs, a door) | Transcript on the overlay; caption with an English line |
| 6 | 40–48 s | "Ye padho" at the Hindi sign → read aloud | Sign 30–40 cm from the camera, flat, well lit | The sign in frame; caption |
| 7 | 48–54 s | "Tamil mein bolo" → the next alert or answer comes in Tamil | — | Language on the overlay title (`ta`) |
| 8 | 54–60 s | The overlay full screen: p50/p95 for reflex, name and describe | Overlay on | The numbers, readable |

## ~3-minute cut

The 60-second shots, plus:

- **Enrollment by voice, eyes closed** (30 s): "Isko Priya ke naam se save karo" → "Kya aap save hone ke liye raazi hain?" → Priya says "haan" → "Teen second camera ki taraf dekhiye" → "Save ho gaya" → walk away and back → named. Show the user's eyes closed.
- **Delete by voice** (10 s): "Priya ko delete karo" → "Delete ho gaya". Priya walks up again → "unknown".
- **Hazard interrupts an answer** (15 s): a long question, then someone wheels a cycle past mid-answer. The alert cuts in and the answer does not resume. "Repeat" replays it.
- **Reading controls** (15 s): "aage" skips a paragraph; "ruko" stops.
- **Offline behaviour** (15 s): airplane mode → a question → "Internet nahi hai"; alerts and names still work. With the offline speech model (P14), "ruko" and "ye padho" still work by voice.
- **Covered lens** (10 s): a hand over the camera → "Camera saaf nahi dikh raha".
- **Privacy** (10 s, a text card): no photos are stored, only face signatures of people who said yes; transcripts and images are never logged.
- **Architecture** (20 s, a diagram card): the phone does detection, faces, OCR and audio; the relay calls Gnani Prisma (STT), Gnani Timbre (TTS) and the vision model.

## Safety during filming

- The user keeps the cane in every walking shot. Drishti is shown as an addition to the cane.
- No traffic scenes with a blindfolded or eyes-closed user. Vehicles are filmed parked, or with a helper wheeling a cycle past slowly.
- The sighted helper stays within arm's reach and out of the camera's path.
