# Drishti

A voice-first Android assistant that sees for blind and low-vision users through the phone camera and speaks what is ahead in Hindi, Hinglish, English or Tamil. Built on Gnani AI's Prisma (speech-to-text) and Timbre (text-to-speech).

Drishti works alongside a cane, never instead of one.

- `app/` — React Native + Expo (TypeScript), Android only
- `server/` — thin FastAPI relay (holds API keys; relays Gnani STT/TTS and the vision model)

See [PLAN.md](PLAN.md) for the build plan and [LIMITATIONS.md](LIMITATIONS.md) for known gaps.
