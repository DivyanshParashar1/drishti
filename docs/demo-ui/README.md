# Drishti demo UI: design handoff (F12)

Design for `docs/demo-ui-design.md`. Source of truth for behaviour and copy is still that brief; this folder is the visual answer to it.

Live canvas: https://claude.ai/artifact/BJ4QPCXQt9wvMrVYZJY21E (private; edit there, then re-export here).

## Files

- `tokens.ts`: final colours, type, shape and motion values. Copy into the app (for example `app/src/ui/tokens.ts`).
- `Main.dc.html` and `F02` to `F20`: one file per numbered frame from section 7 of the brief. Each is plain HTML + CSS at 412 x 915 (frame 20 is 360 x 800). Open in a browser to see them; read the markup and CSS for exact sizes, offsets and copy.
- `Sheet-Components.dc.html`: every component in every state (strip, chips, box tags, caption panel per source, temple strips, latency card, toasts).
- `Sheet-Tokens.dc.html`: the token tables with contrast ratios and what changed from the brief.
- `scene.svg`, `chair.svg`, `step.svg`: illustrated stand-in for the camera feed. Not for the app.
- `canvas.json`: canvas layout index. Ignore when coding.

The `.dc.html` files load `./support.js` from the design tool. It is not needed to read them; opened without it they may show unstyled placeholders, so prefer the live canvas for visuals.

## Frame to component map

| Frame | Shows | Components used |
| --- | --- | --- |
| 01 Main | Live, idle | StatusStrip, DetectionBox (far, plain person), TempleStrip x2, LatencyCard (empty) |
| 02 | Alert, near | DetectionBox near + pulse, CaptionPanel ALERT red, LatencyCard |
| 03 | Known person | DetectionBox known, CaptionPanel NAME |
| 04 | Unknown person | DetectionBox unknown (dashed), CaptionPanel NAME grey |
| 05 | Listening | TempleStrip left held + waveform, edge glow, voice chip LISTENING, caption dimmed |
| 06 | Thinking | TranscriptBubble, CaptionPanel + indeterminate bar, voice chip THINKING |
| 07 | Answer streaming (Hindi) | CaptionPanel with previous sentence dimmed, English line |
| 08 | Urgent alert interrupts answer | Collapsed answer strip, CaptionPanel with red border flash |
| 09 | Reading a Hindi sign | Mode chip READING 2/5, CaptionPanel READING, no English line |
| 10 | Enrolment, consent | Mode chip SAVING…, CONSENT NEEDED badge |
| 11 | Enrolment, capturing | Countdown ring on face box |
| 12 | Offline | Two-row strip with OFFLINE · ALERTS ON DEVICE badge |
| 13 | Camera blocked | Dimmed feed, eye-slash icon, SYSTEM caption |
| 14 | Tamil | Language chip, Tamil caption fit check |
| 15 | Quiet mode | QUIET chip, far non-vehicle boxes at 40% |
| 16 | Real-user mode | Black screen, dim wordmark only |
| 17 | Mode-switch toast | Toast under the strip, latency card shifted down |
| 18 | Permission, camera | Only screen with a normal button |
| 19 | First run, cane line | Enlarged caption, progress dots |
| 20 | 360 dp check of 07 | Same layout at 360 x 800 |

## Decisions that differ from the brief

- `scrim` 0.72 to 0.78, `scrim-light` 0.45 to 0.55, `text-3` `#8E8E93` to `#A8A8AE`: the originals failed 4.5:1 over a white feed.
- Brand colour is cyan `#4CCFE6` (not saffron), so it never reads as an alert colour or the orange offline badge.
- `label` is 12 sp (was 13) so the strip fits one row at 360 dp.
- All filled tags (box tags, source pills) use black text.
- Unknown-person caption uses a grey NAME tag.
- Latency numbers, p50/p95, the Tamil and Hindi sentences and the name "Priya" are illustrative; real values come from metrics and `clips.generated.ts`.

## Notes for the React Native build

- No blur. Scrims are flat alpha fills; the listening glow is an edge gradient or stroke.
- Temples are the only buttons on the main screen. Keep right-temple taps out of the triple-tap debug gesture.
- Tags go inside the box when it touches the top of the frame.
- Caption panel: max 3 lines for the current sentence; truncate earlier sentences, never the current one.
