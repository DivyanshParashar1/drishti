"""Render the Drishti logo (docs/demo-ui/logo, Logo.dc.html) into the app's icon, splash and in-app PNGs.

  cd app && uv run --no-project --with resvg-py python -I scripts/make_brand_assets.py

Outputs (app/assets):
  icon.png                       1024  launcher icon (drishti-app-icon.svg)
  android-icon-foreground.png    1024  adaptive icon foreground (drishti-icon-foreground.svg); background colour #0A0E11 in app.config.ts
  android-icon-monochrome.png    1024  themed-icon mask: the foreground geometry in one colour
  splash-icon.png                1024  the mark on transparent, shown on black by expo-splash-screen
  favicon.png                    48    heavier-stroke mark
  brand/mark.png (+@2x, @3x)     24dp  status strip / permission screen: the sheet's heavier-stroke strip variant
  brand/mark-mono.png (+@2x, @3x) 48dp white, tinted in the app (real-user mode's dim mark)
"""

import re
from pathlib import Path

import resvg_py

APP = Path(__file__).resolve().parent.parent
LOGO = APP.parent / "docs" / "demo-ui" / "logo"
OUT = APP / "assets"

BRACKETS = "M8 28V14a6 6 0 0 1 6-6h14M68 8h14a6 6 0 0 1 6 6v14M88 68v14a6 6 0 0 1-6 6H68M28 88H14a6 6 0 0 1-6-6V68"
EYE = "M16 48C28 32 40 28 48 28s20 4 32 20C68 64 56 68 48 68s-20-4-32-20Z"


def mark(bracket_w: float, eye_w: float, bars: list[tuple[float, float, float, float]], white="#FFFFFF", cyan="#4CCFE6") -> str:
    """The 96-unit mark; `bars` are (x, y, w, h) of the three waveform bars (rx = w / 2)."""
    rects = "".join(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{w / 2}" fill="{cyan}"/>' for x, y, w, h in bars)
    return (
        f'<path d="{BRACKETS}" stroke="{white}" stroke-width="{bracket_w}" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="{EYE}" stroke="{cyan}" stroke-width="{eye_w}" stroke-linejoin="round"/>{rects}'
    )


PRIMARY = dict(bracket_w=6, eye_w=5, bars=[(35, 43, 6, 10), (45, 37, 6, 22), (55, 41, 6, 14)])
# Logo sheet, "Size ladder · heavier strokes at 32 and below" (the strip and 32 px variant).
HEAVY = dict(bracket_w=8, eye_w=7, bars=[(34, 42, 8, 12), (44, 36, 8, 24), (54, 40, 8, 16)])


def svg96(body: str) -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">{body}</svg>'


def from_file(name: str) -> str:
    """A logo SVG without its provenance metadata (resvg doesn't need it)."""
    return re.sub(r"<metadata>.*?</metadata>", "", (LOGO / name).read_text(), flags=re.S)


def render(svg: str, path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(resvg_py.svg_to_bytes(svg_string=svg, width=size, height=size)))
    print(f"{path.relative_to(APP)}  {size}px")


def main() -> None:
    render(from_file("drishti-app-icon.svg"), OUT / "icon.png", 1024)
    fg = from_file("drishti-icon-foreground.svg")
    render(fg, OUT / "android-icon-foreground.png", 1024)
    # Themed (monochrome) icon: same placement as the foreground, one colour.
    mono_fg = re.sub(r'(stroke|fill)="#(?:FFFFFF|4CCFE6)"', r'\1="#FFFFFF"', fg)
    render(mono_fg, OUT / "android-icon-monochrome.png", 1024)
    render(svg96(mark(**PRIMARY)), OUT / "splash-icon.png", 1024)
    render(svg96(mark(**HEAVY)), OUT / "favicon.png", 48)
    for scale, suffix in ((1, ""), (2, "@2x"), (3, "@3x")):
        render(svg96(mark(**HEAVY)), OUT / "brand" / f"mark{suffix}.png", 24 * scale)
        render(svg96(mark(**PRIMARY, cyan="#FFFFFF")), OUT / "brand" / f"mark-mono{suffix}.png", 48 * scale)


if __name__ == "__main__":
    main()
