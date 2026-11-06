"""Build the app's clip packs from server/phrases.json (spec §10, D12).

    uv run python scripts/gen_clips.py --langs hi-en            # one pack
    uv run python scripts/gen_clips.py --langs hi-en,hi,en,ta   # all packs
    uv run python scripts/gen_clips.py --langs hi-en --force    # regenerate everything
    uv run python scripts/gen_clips.py --dry-run                # what would be generated
    uv run python scripts/gen_clips.py --no-tts                 # earcons + TS map only, no credits

Writes app/assets/clips/<lang>/<key>.mp3 + manifest.json, earcons (synthesised locally, no
credits) to app/assets/clips/earcons/, and app/src/audio/clips.generated.ts, the static require()
map Metro needs. Idempotent: a clip is regenerated only when its text changed, its file is
missing, or --force is given. Clips for keys removed from phrases.json are deleted.
Spends Gnani credits for each clip it generates; stops at the first credits_exhausted.
"""

import argparse
import asyncio
import json
import math
import os
import struct
import sys
import wave
from pathlib import Path

from _common import SERVER_DIR

from app.gnani.errors import UpstreamError
from app.gnani.languages import LANGS, TTS

REPO = SERVER_DIR.parent
PHRASES = SERVER_DIR / "phrases.json"
CLIPS_DIR = REPO / "app" / "assets" / "clips"
TS_PATH = REPO / "app" / "src" / "audio" / "clips.generated.ts"


def load_phrases(path: Path = PHRASES) -> dict[str, dict[str, str]]:
    return json.loads(path.read_text())


def load_manifest(lang_dir: Path) -> dict:
    path = lang_dir / "manifest.json"
    return json.loads(path.read_text()) if path.exists() else {"clips": {}}


def todo(phrases: dict, lang: str, lang_dir: Path, manifest: dict, force: bool) -> list[str]:
    """Keys whose clip is missing, stale (text or voice changed) or forced."""
    voice = f"{TTS[lang].model}/{TTS[lang].voice}"
    keys = []
    for key, texts in phrases.items():
        entry = manifest["clips"].get(key)
        if (
            force
            or entry is None
            or entry.get("text") != texts[lang]
            or manifest.get("voice") != voice
            or not (lang_dir / entry["file"]).exists()
        ):
            keys.append(key)
    return keys


async def build_lang(tts, phrases: dict, lang: str, clips_dir: Path, force: bool) -> dict:
    """Generate one language pack. Returns {"made": [...], "failed": {key: code}, "removed": [...]}."""
    lang_dir = clips_dir / lang
    lang_dir.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest(lang_dir)
    voice = f"{TTS[lang].model}/{TTS[lang].voice}"
    if manifest.get("voice") != voice:
        manifest["clips"] = {}  # every clip is regenerated below; drop entries for the old voice
    report: dict = {"made": [], "failed": {}, "removed": []}

    for key in sorted(set(manifest["clips"]) - set(phrases)):
        (lang_dir / manifest["clips"].pop(key)["file"]).unlink(missing_ok=True)
        report["removed"].append(key)

    manifest["voice"] = voice
    manifest["lang"] = lang
    try:
        for key in todo(phrases, lang, lang_dir, manifest, force):
            text = phrases[key][lang]
            try:
                audio = await tts.synth(text, lang)
            except UpstreamError as e:
                report["failed"][key] = e.code
                if e.code == "credits_exhausted":
                    break
                continue
            file = f"{key}.mp3"
            (lang_dir / file).write_bytes(audio)
            manifest["clips"][key] = {
                "file": file,
                "text": text,
                "en": phrases[key]["en"],
                "bytes": len(audio),
            }
            report["made"].append(key)
    finally:
        manifest["clips"] = dict(sorted(manifest["clips"].items()))
        (lang_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
        )
    return report


# --- earcons: short tones, synthesised here so they cost nothing ---

EARCONS = {
    # name: [(frequency Hz, duration ms), ...]; 0 Hz is a gap
    "listen_start": [(660, 70), (0, 20), (880, 90)],
    "listen_stop": [(880, 70), (0, 20), (660, 90)],
    "error": [(220, 120), (0, 60), (220, 120)],
}
EARCON_RATE = 24000


def tone_samples(parts: list[tuple[int, int]], rate: int = EARCON_RATE) -> list[int]:
    out: list[int] = []
    for freq, ms in parts:
        n = rate * ms // 1000
        fade = min(n // 4, rate * 8 // 1000)  # 8 ms fades avoid clicks
        for i in range(n):
            if not freq:
                out.append(0)
                continue
            env = min(1.0, i / fade if fade else 1, (n - 1 - i) / fade if fade else 1)
            out.append(int(0.4 * 32767 * env * math.sin(2 * math.pi * freq * i / rate)))
    return out


def write_earcons(clips_dir: Path) -> list[str]:
    d = clips_dir / "earcons"
    d.mkdir(parents=True, exist_ok=True)
    for name, parts in EARCONS.items():
        samples = tone_samples(parts)
        with wave.open(str(d / f"{name}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(EARCON_RATE)
            w.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    return sorted(EARCONS)


# --- the TypeScript map for Metro ---


def render_ts(phrases: dict, clips_dir: Path, ts_path: Path) -> str:
    rel = Path(os.path.relpath(clips_dir, ts_path.parent))

    def q(s: str) -> str:
        return json.dumps(s, ensure_ascii=False)

    lines = [
        "// Generated by server/scripts/gen_clips.py from server/phrases.json. Do not edit.",
        "// A clip with asset null has no audio yet: speak its text with expo-speech instead.",
        "",
        "export type ClipLang = " + " | ".join(q(lang) for lang in LANGS) + ";",
        "",
        "export type ClipKey =",
        *[f"  | {q(k)}" for k in phrases],
        ";",
        "",
        "export interface Clip {",
        "  text: string; // what the clip says",
        "  en: string; // English caption (F12)",
        "  asset: number | null; // require() id, or null if not generated",
        "}",
        "",
        "export const CLIPS: Record<ClipLang, Record<ClipKey, Clip>> = {",
    ]
    for lang in LANGS:
        clips = load_manifest(clips_dir / lang)["clips"]
        lines.append(f"  {q(lang)}: {{")
        for key, texts in phrases.items():
            entry = clips.get(key)
            if entry and entry.get("text") == texts[lang]:
                asset = f"require({q((rel / lang / entry['file']).as_posix())})"
            else:
                asset = "null"
            lines.append(
                f"    {q(key)}: {{ text: {q(texts[lang])}, en: {q(texts['en'])}, asset: {asset} }},"
            )
        lines.append("  },")
    lines += ["};", "", "export const EARCONS = {"]
    for name in sorted(EARCONS):
        lines.append(f"  {name}: require({q((rel / 'earcons' / f'{name}.wav').as_posix())}),")
    lines += ["} as const;", "", "export type EarconName = keyof typeof EARCONS;", ""]
    return "\n".join(lines)


def write_ts(phrases: dict, clips_dir: Path = CLIPS_DIR, ts_path: Path = TS_PATH) -> None:
    ts_path.parent.mkdir(parents=True, exist_ok=True)
    ts_path.write_text(render_ts(phrases, clips_dir, ts_path))


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--langs", default="hi-en", help="comma-separated (default hi-en)")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-tts", action="store_true", help="only write earcons and the TS map")
    args = ap.parse_args()
    langs = args.langs.split(",")
    if bad := [lang for lang in langs if lang not in LANGS]:
        raise SystemExit(f"unknown lang(s): {bad}")
    phrases = load_phrases()

    if args.dry_run:
        for lang in langs:
            lang_dir = CLIPS_DIR / lang
            keys = todo(phrases, lang, lang_dir, load_manifest(lang_dir), args.force)
            chars = sum(len(phrases[k][lang]) for k in keys)
            print(f"{lang}: {len(keys)} clips to generate ({chars} chars)")
        return 0

    if args.no_tts:
        write_earcons(CLIPS_DIR)
        write_ts(phrases)
        print(f"wrote earcons and {TS_PATH.relative_to(REPO)} (no clips generated)")
        return 0

    import httpx

    from app.gnani.tts import GnaniTts
    from app.settings import Settings

    s = Settings()
    failed = False
    async with httpx.AsyncClient() as http:
        tts = GnaniTts(http, s.gnani_api_key, s.gnani_tts_url, timeout_s=s.tts_timeout_s)
        for lang in langs:
            r = await build_lang(tts, phrases, lang, CLIPS_DIR, args.force)
            print(
                f"{lang}: made {len(r['made'])}, removed {len(r['removed'])}, failed {r['failed'] or 0}"
            )
            failed |= bool(r["failed"])
    write_earcons(CLIPS_DIR)
    write_ts(phrases)
    print(f"wrote {TS_PATH.relative_to(REPO)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
