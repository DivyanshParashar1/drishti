"""Drishti submission video: Parts 2, 4, 5 and the Part 3 title cards.
Pillow frames (2x supersampled) -> ffmpeg. 1080x1920, 30 fps.
usage: render.py OUTDIR [part2|part4|part5|cards|still:part:t ...]
"""
import math, os, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
NAR = HERE / "narration"
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
ICON = "/Users/divyanshparashar/Desktop/learning/drishti/app/assets/icon.png"
W, H, SS, FPS = 1080, 1920, 2, 30

BG = (10, 14, 17); PANEL = (22, 28, 32); LINE = (58, 64, 70)
CYAN = (76, 207, 230); WHITE = (240, 242, 244); GREY = (150, 156, 162)
YEL = (255, 212, 0); VIO = (155, 140, 250); RED = (255, 90, 90); GREEN = (52, 199, 89)

AV = "/System/Library/Fonts/Avenir Next.ttc"
FACES = {"bold": (AV, 0), "demi": (AV, 2), "med": (AV, 5), "reg": (AV, 7), "heavy": (AV, 8),
         "hi": ("/System/Library/Fonts/Kohinoor.ttc", 0),
         "ta": ("/System/Library/Fonts/Supplemental/Tamil Sangam MN.ttc", 0),
         "bn": ("/System/Library/Fonts/KohinoorBangla.ttc", 0),
         "te": ("/System/Library/Fonts/KohinoorTelugu.ttc", 0),
         "kn": ("/System/Library/Fonts/Supplemental/Kannada Sangam MN.ttc", 0),
         "rupee": ("/System/Library/Fonts/Kohinoor.ttc", 3)}
_fc = {}
def F(face, size):
    k = (face, size)
    if k not in _fc:
        p, i = FACES[face]; _fc[k] = ImageFont.truetype(p, int(size * SS), index=i)
    return _fc[k]

def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ramp(t, a, b): return clamp((t - a) / (b - a)) if b > a else float(t >= a)
def ease(x): x = clamp(x); return x * x * (3 - 2 * x)
def back(x):
    x = clamp(x); c = 1.70158; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2
def fin(t, a, d=0.4): return ease(ramp(t, a, a + d))
def win(t, a, b, d=0.4): return min(fin(t, a, d), 1 - fin(t, b - d, d))
def lerp(a, b, x): return a + (b - a) * x
def mix(c1, c2, x): return tuple(int(lerp(p, q, x)) for p, q in zip(c1, c2))

class C:
    def __init__(self):
        self.im = Image.new("RGB", (W * SS, H * SS), BG)
        self.d = ImageDraw.Draw(self.im, "RGBA")
    def _c(self, col, a): return (*col[:3], int(255 * clamp(a)))
    def s(self, *v): return [x * SS for x in v]
    def rect(self, x0, y0, x1, y1, r, fill=None, a=1, outline=None, w=3, oa=None):
        if a <= 0: return
        self.d.rounded_rectangle(self.s(x0, y0, x1, y1), radius=r * SS,
                                 fill=self._c(fill, a) if fill else None,
                                 outline=self._c(outline, a if oa is None else oa) if outline else None, width=int(w * SS))
    def circle(self, x, y, r, fill=None, a=1, outline=None, w=3):
        if a <= 0 or r <= 0: return
        self.d.ellipse(self.s(x - r, y - r, x + r, y + r), fill=self._c(fill, a) if fill else None,
                       outline=self._c(outline, a) if outline else None, width=int(w * SS))
    def ellipse(self, x, y, rx, ry, fill, a=1):
        if a > 0: self.d.ellipse(self.s(x - rx, y - ry, x + rx, y + ry), fill=self._c(fill, a))
    def line(self, pts, col, a=1, w=6):
        if a <= 0: return
        self.d.line([v * SS for p in pts for v in p], fill=self._c(col, a), width=int(w * SS), joint="curve")
        for p in (pts[0], pts[-1]): self.circle(p[0], p[1], w / 2, col, a)
    def text(self, x, y, s, size, col=WHITE, a=1, face="demi", anchor="mm", maxw=None, lh=1.25):
        if a <= 0 or not s: return
        f = F(face, size)
        lines = wrap(s, f, maxw) if maxw else s.split("\n")
        n = len(lines); y0 = y - (n - 1) * size * lh / 2
        for i, ln in enumerate(lines):
            xy = (x * SS, (y0 + i * size * lh) * SS)
            bb = self.d.textbbox(xy, ln, font=f, anchor=anchor)
            m = Image.new("L", (int(bb[2] - bb[0]) + 8, int(bb[3] - bb[1]) + 8), 0)
            ImageDraw.Draw(m).text((xy[0] - bb[0] + 4, xy[1] - bb[1] + 4), ln, font=f, fill=int(255 * clamp(a)), anchor=anchor)
            self.im.paste(tuple(col[:3]), (int(bb[0]) - 4, int(bb[1]) - 4), m)
    def tw(self, s, size, face="demi"): return F(face, size).getlength(s) / SS
    def paste(self, img, x, y, size, a=1):
        if a <= 0: return
        im = img.resize((int(size * SS), int(size * SS)), Image.LANCZOS)
        if a < 1:
            al = im.getchannel("A").point(lambda v: int(v * a)); im.putalpha(al)
        self.im.paste(im, (int((x - size / 2) * SS), int((y - size / 2) * SS)), im)
    def frame(self): return self.im.reduce(SS).tobytes()

def wrap(s, f, maxw):
    out = []
    for para in s.split("\n"):
        cur = ""
        for w in para.split(" "):
            t = (cur + " " + w).strip()
            if f.getlength(t) / SS <= maxw or not cur: cur = t
            else: out.append(cur); cur = w
        out.append(cur)
    return out

def caption(c, t, items, y=300, size=60):
    """Top caption lines for muted autoplay: (start, end, text)."""
    for a, b, s in items:
        al = win(t, a, b, 0.35)
        if al > 0: c.text(540, y + (1 - al) * 20, s, size, WHITE, al, "demi", maxw=920)

# ---------- shared drawings ----------
def person(c, x, base, s, col, ph, a=1, cane=False, glasses=0.0, walk=True):
    hip = (x, base - 95 * s); neck = (x, base - 175 * s); head = (x, base - 205 * s)
    sw = math.sin(ph) * (0.35 if walk else 0)
    for sgn in (1, -1):
        ang = sgn * sw
        knee = (hip[0] + math.sin(ang) * 48 * s, hip[1] + math.cos(ang) * 48 * s)
        c.line([hip, knee, (knee[0] + math.sin(ang * 0.6) * 47 * s, base)], col, a, 9 * s)
    c.line([neck, hip], col, a, 10 * s)
    c.circle(*head, 24 * s, col, a)
    hand_l = (x - 30 * s - sw * 20 * s, base - 105 * s)
    c.line([(x, base - 165 * s), hand_l], col, a, 8 * s)
    hand_r = (x + 38 * s, base - 110 * s)
    c.line([(x, base - 165 * s), hand_r], col, a, 8 * s)
    tip = None
    if cane:
        tip = (x + 150 * s + math.sin(ph * 0.5) * 55 * s, base + 12 * s)
        c.line([hand_r, tip], WHITE, a, 5 * s)
        c.line([(lerp(hand_r[0], tip[0], .78), lerp(hand_r[1], tip[1], .78)), tip], RED, a, 5 * s)
    if glasses > 0:
        g = glasses
        for dx in (-13, 13): c.circle(head[0] + dx * s, head[1] - 2 * s, 11 * s, BG, g, CYAN, 4 * s)
        c.line([(head[0] - 2 * s, head[1] - 4 * s), (head[0] + 2 * s, head[1] - 4 * s)], CYAN, g, 3 * s)
    return tip

ICON_IM = Image.open(ICON).convert("RGBA")
MARK = ICON_IM.crop((200, 200, 824, 824))

def phone(c, x, y, h, a=1, glow=0.0):
    w = h * 0.5
    if glow > 0: c.rect(x - w / 2 - 14, y - h / 2 - 14, x + w / 2 + 14, y + h / 2 + 14, 52, CYAN, glow * 0.18 * a)
    c.rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2, w * 0.14, PANEL, a, LINE, 5)
    c.paste(MARK, x, y - h * 0.05, w * 0.82, a)
    c.rect(x - w * 0.18, y + h / 2 - 34, x + w * 0.18, y + h / 2 - 26, 4, GREY, a * 0.6)

def car(c, x, y, s, col, a):
    c.rect(x - 110 * s, y - 40 * s, x + 110 * s, y + 25 * s, 22 * s, col, a)
    c.rect(x - 65 * s, y - 85 * s, x + 55 * s, y - 30 * s, 22 * s, col, a)
    c.rect(x - 52 * s, y - 75 * s, x - 8 * s, y - 40 * s, 8 * s, BG, a * 0.8)
    c.rect(x + 2 * s, y - 75 * s, x + 44 * s, y - 40 * s, 8 * s, BG, a * 0.8)
    for dx in (-62, 62): c.circle(x + dx * s, y + 25 * s, 24 * s, (30, 34, 38), a, col, 6 * s)
    c.circle(x - 108 * s, y - 15 * s, 9 * s, YEL, a)

def ping(c, x, y, r, col, t, t0, a=1):
    if t < t0: return
    k = (t - t0) % 1.4 / 1.4
    c.circle(x, y, r * (1 + k * 0.5), None, a * (1 - k) * 0.9, col, 5)
    c.circle(x, y, r, None, a * fin(t, t0, 0.3) * 0.9, col, 5)

# ---------- Part 2: animated explainer ----------
P2 = [(0.3, "p2_1"), (4.8, "p2_2"), (7.4, "p2_3"), (9.6, "p2_4"), (11.8, "p2_5n"), (16.8, "p2_7a"),
      (20.0, "p2_7b"), (23.2, "p2_6")]
P2_DUR = 29.0
BUBBLES = [("hi", "सामने कुर्सी है", -1), ("en", "Chair ahead", 1), ("ta", "முன்னால் நாற்காலி", -1),
           ("bn", "সামনে চেয়ার", 1), ("te", "ముందు కుర్చీ", -1), ("kn", "ಮುಂದೆ ಕುರ್ಚಿ", 1)]

def lanyard_phone(c, x, base, s, a, drop=1.0):
    """Phone hanging on the chest, camera facing forward (to the right). Returns the lens point."""
    if a <= 0: return None
    neck_l = (x - 10 * s, base - 172 * s); neck_r = (x + 10 * s, base - 172 * s)
    py = base - 135 * s - (1 - drop) * 140 * s
    px = x + 16 * s
    c.line([neck_l, (px - 4 * s, py - 16 * s)], CYAN, a, 3 * s)
    c.line([neck_r, (px + 4 * s, py - 16 * s)], CYAN, a, 3 * s)
    c.rect(px - 12 * s, py - 26 * s, px + 12 * s, py + 26 * s, 5 * s, (40, 48, 54), a, CYAN, 3 * s)
    lens = (px + 12 * s, py - 14 * s)
    c.circle(*lens, 4 * s, CYAN, a)
    return lens

def part2(t):
    c = C(); ph = t * 4.2
    GROUND = 1380; UX = 250; US = 1.25
    scene = 1 - fin(t, 16.2, 0.6)            # street scene visible
    cam = fin(t, 13.0, 0.8) * scene           # camera cone
    c.rect(-20, GROUND, W + 20, H + 20, 0, (16, 21, 25), scene)
    c.line([(0, GROUND), (W, GROUND)], LINE, scene, 3)
    # wall + notice
    c.rect(600, 640, 1100, GROUND, 0, (18, 24, 28), scene)
    na = max(0.25, fin(t, 9.6, 0.3)) * scene
    c.rect(720, 790, 940, 960, 10, (235, 228, 205), na)
    for i in range(4): c.rect(745, 820 + i * 32, 915 - (i % 2) * 60, 832 + i * 32, 4, (90, 90, 90), na)
    c.rect(820, 960, 840, 1010, 0, LINE, scene)
    # car ahead, pulling out
    ca = max(0.25, fin(t, 4.8, 0.3)) * scene
    cx = 1010 - 60 * ease(ramp(t, 4.8, 7.0))
    car(c, cx, 1310, 0.8, (120, 128, 136) if t < 4.8 else mix((120, 128, 136), YEL, fin(t, 4.8, .3)), ca)
    # friend walking up
    fa = max(0.25, fin(t, 7.4, 0.3)) * scene
    fx = 760 - 70 * ease(ramp(t, 7.4, 9.4))
    person(c, fx, GROUND, 1.0, GREY if t < 7.4 else mix(GREY, GREEN, fin(t, 7.4, .3)), ph * 0.8 + 1, fa, walk=7.4 < t < 9.4)
    # camera cone, behind the user
    ua = scene * fin(t, 0.0, 0.4)
    lx, ly = UX + 26 * US, GROUND - 148 * US
    if cam > 0:
        reach = ease(ramp(t, 13.0, 13.8))
        ex = lerp(lx, W + 40, reach)
        c.d.polygon([v * SS for v in (lx, ly, ex, lerp(ly, 700, reach), ex, lerp(ly, GROUND + 60, reach))],
                    fill=c._c(CYAN, 0.10 * cam))
    tip = person(c, UX, GROUND, US, WHITE, ph, ua, cane=True)
    lanyard_phone(c, UX, GROUND, US, fin(t, 11.6, .3) * scene, ease(ramp(t, 11.6, 12.4)))
    c.ellipse(tip[0], GROUND + 14, 70, 16, CYAN, 0.35 * ua)
    c.ellipse(UX + 190, GROUND + 14, 120, 26, CYAN, 0.10 * ua)
    # highlights (beyond reach), then detection boxes (camera sees them)
    objs = [(cx, 1275, 120, YEL, 4.8, "A car", "car", 13.9),
            (fx, GROUND - 110, 130, GREEN, 7.4, "A friend", "Nakshatra", 14.4),
            (830, 875, 140, WHITE, 9.6, "A notice", "notice", 14.9)]
    for (x, y, r, col, t0, lab, det, td) in objs:
        if t >= t0:
            pa = scene * (1 - fin(t, 12.8, .4))
            ping(c, x, y, r, col, t, t0, pa)
            c.text(x, y - r - 40, lab, 40, col, fin(t, t0 + .1, .3) * pa, "bold")
        if t >= td:
            k = back(ramp(t, td, td + .35)); a = fin(t, td, .2) * scene
            c.rect(x - r * .85 * k, y - r * .85 * k, x + r * .85 * k, y + r * .85 * k, 10, None, a, CYAN, 5)
            c.rect(x - r * .85 * k, y - r * .85 * k - 46, x - r * .85 * k + c.tw(det, 30, "bold") + 24, y - r * .85 * k, 6, CYAN, a)
            c.text(x - r * .85 * k + 12, y - r * .85 * k - 23, det, 30, BG, a, "bold", anchor="lm")
    c.text(UX + 190, GROUND + 80, "the cane's reach", 34, CYAN, fin(t, 4.8, .4) * scene * 0.9 * (1 - fin(t, 12.8, .4)), "med")
    if t >= 12.4:
        c.text(UX + 30, GROUND - 330 * US / 1.25 - 40, "phone on a lanyard", 32, CYAN, win(t, 12.4, 16.0), "demi")
    caption(c, t, [(0.3, 4.6, "A white cane finds what's at your feet."),
                   (4.7, 11.5, "But not what's beyond its reach."),
                   (11.8, 16.2, "Drishti: a phone on a lanyard, camera facing the world.")])
    # close-up: a five-thousand-rupee phone
    if t > 16.2:
        pa = fin(t, 16.2, 0.6) * (1 - fin(t, 28.2, .8))
        ky = ease(ramp(t, 22.9, 23.6))
        py = lerp(1000, 820, ky); ph_h = lerp(700, 520, ky)
        c.line([(540 - 150, 330 + (1 - pa) * 200), (540 - ph_h * 0.18, py - ph_h / 2)], CYAN, pa * (1 - ky), 6)
        c.line([(540 + 150, 330 + (1 - pa) * 200), (540 + ph_h * 0.18, py - ph_h / 2)], CYAN, pa * (1 - ky), 6)
        phone(c, 540, py, ph_h, pa, glow=pa)
        ba = fin(t, 16.9, .3) * (1 - ky)
        k = back(ramp(t, 16.9, 17.4))
        if ba > 0 and k > 0.05:
            c.rect(540 + 120 - 150 * k, 640 - 50 * k, 540 + 120 + 150 * k, 640 + 50 * k, 50 * k, YEL, ba)
            c.text(540 + 120, 640, "₹5,000", 64 * k, BG, ba, "rupee")
        chips = [(17.3, "Any Android phone"), (20.0, "Light on-device models"), (21.0, "No special hardware")]
        for i, (t0, sx) in enumerate(chips):
            a = fin(t, t0, .35) * (1 - ky)
            c.text(540, 1440 + i * 80 + (1 - fin(t, t0, .35)) * 20, sx, 48, WHITE if i else CYAN, a, "demi")
        caption(c, t, [(16.8, 22.8, "Designed for a 5,000-rupee phone.")], y=280, size=62)
    # bubbles
    if t > 23.0:
        caption(c, t, [(23.2, 28.6, "It tells you what's there, in your own language.")], y=280, size=60)
        for i, (lang, s, side) in enumerate(BUBBLES):
            t0 = 23.7 + i * 0.45
            if t < t0: continue
            k = back(ramp(t, t0, t0 + 0.45)); a = fin(t, t0, .2) * (1 - fin(t, 28.2, .8))
            row = i // 2; col = i % 2
            bx = 300 if col == 0 else 780; by = 1260 + row * 170
            face = lang if lang != "en" else "demi"
            size = 44 * k
            if size < 4: continue
            w_ = c.tw(s, 44, face) + 70
            c.rect(bx - w_ / 2 * k, by - 55 * k, bx + w_ / 2 * k, by + 55 * k, 40 * k, CYAN if lang == "en" else PANEL, a, CYAN, 4)
            c.text(bx, by, s, size, BG if lang == "en" else WHITE, a, face)
    return c.frame()

# ---------- Part 4: how it works ----------
P4 = [(0.3, "p4_1"), (4.8, "p4_2a"), (7.3, "p4_2b"), (12.7, "p4_3a"), (17.2, "p4_3b"), (21.2, "p4_4"),
      (29.0, "p4_5"), (34.2, "p4_6"), (38.5, "p4_7a"), (43.4, "p4_7b"), (47.9, "p4_8"), (55.0, "p4_9")]
P4_DUR = 61.5
N = {"cam": (240, 1460), "mod": (540, 1460), "spk": (840, 1460), "mic": (240, 1170),
     "pri": (240, 650), "vis": (540, 650), "tim": (840, 650)}

def node(c, key, label, sub, col, a, hot=0.0):
    x, y = N[key]
    if a <= 0: return
    if hot > 0: c.rect(x - 128, y - 66, x + 128, y + 66, 30, col, a * hot * 0.25)
    c.rect(x - 118, y - 56, x + 118, y + 56, 26, PANEL, a, col, 4)
    c.text(x, y - (12 if sub else 0), label, 34, WHITE, a, "bold")
    if sub: c.text(x, y + 26, sub, 24, col, a * 0.9, "med")

def path_pts(keys, via=None):
    pts = [N[k] for k in keys]
    return pts

def seg_draw(c, p0, p1, prog, col, a, w=6, dashed=False):
    if prog <= 0 or a <= 0: return
    x = lerp(p0[0], p1[0], prog); y = lerp(p0[1], p1[1], prog)
    if dashed:
        n = 14
        for i in range(n):
            u0, u1 = i / n, (i + 0.5) / n
            if u0 > prog: break
            u1 = min(u1, prog)
            c.line([(lerp(p0[0], p1[0], u0), lerp(p0[1], p1[1], u0)), (lerp(p0[0], p1[0], u1), lerp(p0[1], p1[1], u1))], col, a, w)
    else:
        c.line([p0, (x, y)], col, a, w)

def edge(k0, k1):
    (x0, y0), (x1, y1) = N[k0], N[k1]
    if y0 == y1:
        s = 1 if x1 > x0 else -1
        return (x0 + s * 118, y0), (x1 - s * 118, y1)
    s = 1 if y1 > y0 else -1
    return (x0, y0 + s * 56), (x1, y1 - s * 56)

def dots(c, segs, t, col, a, period=1.4, speed=1.0, n=3):
    if a <= 0: return
    L = [math.dist(p, q) for p, q in segs]; tot = sum(L)
    for j in range(n):
        u = ((t * speed / period) + j / n) % 1 * tot
        for (p, q), l in zip(segs, L):
            if u <= l:
                k = u / l; c.circle(lerp(p[0], q[0], k), lerp(p[1], q[1], k), 11, col, a); break
            u -= l

def wifi_off(c, x, y, col, a):
    for r in (34, 22, 10):
        c.d.arc([v * SS for v in (x - r, y - r, x + r, y + r)], 225, 315, fill=c._c(col, a), width=int(5 * SS))
    c.circle(x, y + 2, 4, col, a)
    c.line([(x - 30, y - 34), (x + 30, y + 14)], RED, a, 5)

def cloud_icon(c, x, y, s, col, a):
    for dx, dy, r in ((-22, 6, 20), (0, -8, 26), (24, 4, 20)): c.circle(x + dx * s, y + dy * s, r * s, col, a)
    c.rect(x - 40 * s, y + 4 * s, x + 42 * s, y + 26 * s, 10 * s, col, a)

def part4(t):
    c = C()
    # --- intro: two clocks
    ia = 1 - fin(t, 4.3, 0.5)
    if ia > 0:
        c.text(540, 640, "How Drishti works", 92, WHITE, fin(t, 0.2, .5) * ia, "bold")
        for x, col, sp, lab in ((330, CYAN, 3.0, "fast"), (750, VIO, 0.12, "slow")):
            a = fin(t, 1.6, .5) * ia
            c.circle(x, 1080, 140, PANEL, a, col, 6)
            for i in range(12):
                an = i / 12 * 2 * math.pi
                c.circle(x + 118 * math.sin(an), 1080 - 118 * math.cos(an), 5, GREY, a)
            an = t * sp * 2 * math.pi
            c.line([(x, 1080), (x + 105 * math.sin(an), 1080 - 105 * math.cos(an))], col, a, 9)
            c.circle(x, 1080, 12, col, a)
            c.text(x, 1290, lab, 48, col, a, "bold")
    if t < 4.3: return c.frame()

    # --- header
    end_a = 1 - fin(t, 54.6, 0.6)
    dim_priv = 1 - 0.94 * win(t, 47.7, 54.8, 0.5)
    c.text(540, 150, "How Drishti works", 52, GREY, fin(t, 4.4, .5) * end_a, "demi")
    A = end_a * dim_priv
    offline = fin(t, 43.6, 0.6)                       # internet lost phase
    online_a = 1 - 0.7 * offline

    # --- phone panel
    pa = fin(t, 4.6, .5) * A
    c.rect(70, 1060, 1010, 1600, 40, (16, 21, 25), pa, LINE, 4)
    c.text(110, 1100, "PHONE", 30, GREY, pa, "bold", anchor="lm")
    wa = fin(t, 5.0, .4) * A
    pulse = 1 + 0.25 * win(t, 17.2, 20.6, .3) * (0.5 + 0.5 * math.sin(t * 8))
    wifi_off(c, 420, 1110, mix(GREY, WHITE, win(t, 17.2, 20.6)), wa * pulse if pulse <= 1 else wa)
    c.text(465, 1102, "offline", 28, GREY, wa, "med", anchor="lm")

    # --- fast lane
    fast = [edge("cam", "mod"), edge("mod", "spk")]
    hot_fast = win(t, 4.8, 21.0, .5)
    node(c, "cam", "Camera", "", CYAN, fin(t, 5.0, .4) * A, hot_fast)
    node(c, "mod", "On-device", "models", CYAN, fin(t, 5.5, .4) * A, hot_fast)
    spk_hot = max(hot_fast, win(t, 34.2, 47.5, .5))
    node(c, "spk", "Speaker", "one voice" if t > 34 else "", mix(CYAN, WHITE, win(t, 34.2, 47.5)), fin(t, 6.0, .4) * A, spk_hot)
    seg_draw(c, *fast[0], ramp(t, 5.4, 5.8), CYAN, A, 6)
    seg_draw(c, *fast[1], ramp(t, 5.9, 6.3), CYAN, A, 6)
    dots(c, fast, t, CYAN, fin(t, 6.3, .3) * A, period=1.0)
    # detections
    for i, lab in enumerate(["car", "chair", "person", "saved face"]):
        t0 = 7.6 + i * 0.6
        if t >= t0:
            k = back(ramp(t, t0, t0 + .35)); a = fin(t, t0, .2) * A
            x = 175 + i * 200 + (40 if i == 3 else 0)
            w_ = c.tw(lab, 28, "demi") + 34
            c.rect(x - w_ / 2 * k, 1540 - 22 * k, x + w_ / 2 * k, 1540 + 22 * k, 20, CYAN, a * 0.18, CYAN, 3)
            c.text(x, 1540, lab, 28 * max(k, .1), WHITE, a, "demi")
    # pre-made Timbre clips
    if t >= 12.7:
        a = fin(t, 12.7, .4) * A
        c.rect(370, 1290, 730, 1350, 20, PANEL, a, CYAN, 3)
        for i in range(9):
            hgt = 8 + 16 * abs(math.sin(i * 1.7 + t * 3))
            c.rect(392 + i * 12, 1320 - hgt / 2, 398 + i * 12, 1320 + hgt / 2, 3, CYAN, a)
        c.text(510, 1320, "Timbre clips, pre-made", 24, WHITE, a, "demi", anchor="lm")
        c.line([(730, 1330), (722, 1404)], CYAN, a * 0.5, 3)

    # fast label
    c.text(540, 1660, "Fast path: on the phone, offline", 40, CYAN, fin(t, 6.0, .4) * A * (1 - fin(t, 34.0, .4)), "bold")

    # --- cloud + slow lane
    ca = fin(t, 21.2, .5) * A * online_a
    c.rect(70, 470, 1010, 830, 40, (16, 21, 25), ca, LINE, 4)
    cloud_icon(c, 150, 510, 0.8, GREY, ca)
    c.text(200, 515, "CLOUD", 30, GREY, ca, "bold", anchor="lm")
    hot_slow = win(t, 21.2, 34.0, .5)
    node(c, "mic", "Mic", "hold & ask", VIO, fin(t, 21.4, .4) * A, hot_slow)
    node(c, "pri", "Prisma", "speech to text", VIO, fin(t, 22.4, .4) * ca, hot_slow)
    node(c, "vis", "Vision", "model", VIO, fin(t, 24.2, .4) * ca, hot_slow)
    node(c, "tim", "Timbre", "text to speech", VIO, fin(t, 29.0, .4) * ca, hot_slow)
    slow = [edge("mic", "pri"), edge("pri", "vis"), edge("vis", "tim"), edge("tim", "spk")]
    for (seg, (a0, a1)) in zip(slow, [(21.6, 22.4), (23.6, 24.2), (28.4, 29.0), (30.0, 30.8)]):
        seg_draw(c, *seg, ramp(t, a0, a1), VIO, A * online_a, 6, dashed=offline > 0.5)
    freeze = win(t, 35.4, 37.8, .2)             # hazard cuts in: answer pauses
    dots(c, slow, t, VIO, fin(t, 30.8, .3) * A * (1 - freeze) * (1 - offline), period=2.0, n=4)
    if offline > 0:
        mx, my = 240, 905
        c.line([(mx - 28, my - 28), (mx + 28, my + 28)], RED, offline * A, 8)
        c.line([(mx - 28, my + 28), (mx + 28, my - 28)], RED, offline * A, 8)
    # slow label
    sl = fin(t, 21.6, .4) * A * (1 - fin(t, 34.0, .4))
    c.text(540, 925, "Slow path: Prisma › vision model › Timbre", 38, VIO, sl, "bold")
    c.text(540, 985, "~2 s", 44, WHITE, sl * fin(t, 30.4, .4), "heavy")

    # --- merge phase
    if t > 35.4:
        k = win(t, 35.4, 38.2, .2)
        c.rect(560, 1360 - 0, 1000, 1400, 0, BG, 0)
        hz = edge("mod", "spk")
        dots(c, [hz], t * 2.5, YEL, k * A, period=1.0, n=2)
        c.rect(700, 1525, 980, 1585, 28, YEL, k * A)
        c.text(840, 1555, "CAR, LEFT!", 30, BG, k * A, "heavy")
    labs = [(34.2, "Hazards interrupt", YEL), (38.5, "Name clips cached offline", CYAN),
            (43.4, "Internet lost: announced, alerts keep running", WHITE)]
    for i, (t0, s, col) in enumerate(labs):
        c.text(540, 1670 + i * 66, s, 38, col, fin(t, t0, .4) * A, "bold")
    if t > 38.5:
        a = fin(t, 38.5, .4) * A
        c.rect(380, 1135, 650, 1190, 22, PANEL, a, CYAN, 3)
        c.text(515, 1162, "“Nakshatra” saved", 28, WHITE, a, "demi")
    if t > 43.4:
        a = fin(t, 43.6, .4) * A
        c.rect(380, 1205, 650, 1260, 22, PANEL, a, WHITE, 3)
        c.text(515, 1232, "“Internet lost”", 28, WHITE, a, "demi")

    # --- privacy
    pv = win(t, 47.7, 54.8, .5)
    if pv > 0:
        for i, (x, lab, tt) in enumerate([(200, "No photos\nstored", 47.9), (540, "Nothing you say\nis logged", 49.6),
                                          (880, "Alongside a cane,\nnever instead", 51.6)]):
            a = fin(t, tt, .4) * pv
            c.circle(x, 800, 120, PANEL, a, LINE, 4)
            if i == 0:
                c.rect(x - 60, 760, x + 60, 850, 12, None, a, WHITE, 6)
                c.circle(x - 25, 785, 12, WHITE, a)
                c.line([(x - 55, 845), (x - 10, 805), (x + 15, 825), (x + 55, 790)], WHITE, a, 6)
            elif i == 1:
                c.rect(x - 50, 740, x + 50, 860, 10, None, a, WHITE, 6)
                for j in range(4): c.line([(x - 30, 770 + j * 24), (x + 30 - (j % 2) * 20, 770 + j * 24)], WHITE, a, 5)
            else:
                c.line([(x - 30, 720), (x + 35, 885)], WHITE, a, 8)
                c.line([(x + 23, 855), (x + 35, 885)], RED, a, 8)
                c.d.arc([v * SS for v in (x - 60, 705, x - 10, 750)], 180, 360, fill=c._c(WHITE, a), width=int(8 * SS))
            if i < 2:
                c.line([(x - 85, 715), (x + 85, 885)], RED, a, 9)
            c.text(x, 990, lab, 36, WHITE, a, "demi")

    # --- finale: Timbre
    if t > 54.6:
        a = fin(t, 54.8, .5) * (1 - fin(t, 60.8, .7))
        lvl = LEVEL4(t)
        for i in range(29):
            x = 540 + (i - 14) * 30
            hgt = 12 + 300 * lvl * (0.35 + 0.65 * abs(math.sin(i * 0.9 + t * 7))) * math.exp(-((i - 14) / 9) ** 2)
            c.rect(x - 8, 900 - hgt / 2, x + 8, 900 + hgt / 2, 8, CYAN, a)
        c.text(540, 560, "This voice you've been hearing?", 54, GREY, a * fin(t, 55.1, .4), "demi")
        k = back(ramp(t, 58.3, 58.8))
        c.text(540, 1260, "Gnani Timbre", 130 * max(k, .05), WHITE, a * fin(t, 58.3, .2), "heavy")
        c.text(540, 1400, "Timbre v3.0 · voice: Yashraj", 42, CYAN, a * fin(t, 58.9, .4), "med")
    return c.frame()

# ---------- Part 5: credits ----------
CREDITS_ROLES = os.environ.get("ROLES", "")  # "role1|role2"
def part5(t):
    c = C(); a = fin(t, 0.0, .5) * (1 - fin(t, 5.0, .6))
    c.paste(MARK, 540, 560, 300, a)
    c.text(540, 790, "Drishti", 120, WHITE, a, "heavy")
    r = CREDITS_ROLES.split("|") if CREDITS_ROLES else ["", ""]
    for i, (nm, rl) in enumerate([("Divyansh Parashar", r[0]), ("Nakshatra", r[1])]):
        y = 990 + i * 110
        c.text(540, y, nm, 54, WHITE, a * fin(t, .3 + i * .2, .4), "bold")
        if rl: c.text(540, y + 50, rl, 34, GREY, a * fin(t, .3 + i * .2, .4), "med")
    c.text(540, 1290, "Built on Gnani AI", 40, GREY, a * fin(t, .8, .4), "med")
    c.text(540, 1350, "Prisma v3.0 (speech-to-text)", 42, CYAN, a * fin(t, .9, .4), "demi")
    c.text(540, 1405, "Timbre v3.0 / v2.5 (text-to-speech)", 42, CYAN, a * fin(t, 1.0, .4), "demi")
    c.text(540, 1530, "github.com/DivyanshParashar1/drishti", 40, WHITE, a * fin(t, 1.3, .4), "demi")
    c.text(540, 1640, "#GreatIndianAIInternshipChallenge  #GnaniAI", 34, GREY, a * fin(t, 1.5, .4), "med")
    return c.frame()
P5_DUR = 5.6

# ---------- title cards ----------
CARDS = [("Instant hazard alerts", "Fully offline"), ("Knows your people", "Only with their spoken consent"),
         ("Save someone by voice", "No screen, no typing"), ("Ask anything", "Answers in about two seconds"),
         ("Reads signs aloud", "Hindi and English"), ("Speaks your language", "Hinglish + 10 Indian languages"),
         ("Hands-free", "Just say its name")]
def card(i):
    title, sub = CARDS[i]
    def f(t):
        c = C(); a = fin(t, 0, .3) * (1 - fin(t, 1.7, .3))
        c.text(540, 760, f"{i + 1} / 7", 40, CYAN, a, "bold")
        k = ease(ramp(t, 0, .5))
        c.text(540, 900 + (1 - k) * 30, title, 92, WHITE, a, "heavy", maxw=940)
        c.line([(540 - 90 * k, 1030), (540 + 90 * k, 1030)], CYAN, a, 6)
        c.text(540, 1110, sub, 52, GREY, a * fin(t, .25, .3), "med", maxw=940)
        return c.frame()
    return f

# ---------- audio + encode ----------
LEVELS = {}
def load_level(cues, dur):
    """Per-frame loudness envelope of the narration, for the finale waveform."""
    import array, wave
    n = int(dur * FPS) + 2; env = [0.0] * n
    for t0, k in cues:
        with wave.open(str(NAR / f"{k}.wav")) as w:
            sr = w.getframerate(); data = array.array("h", w.readframes(w.getnframes()))
        hop = sr // FPS
        for f in range(len(data) // hop):
            seg = data[f * hop:(f + 1) * hop]
            rms = math.sqrt(sum(v * v for v in seg[::4]) / max(1, len(seg[::4]))) / 8000
            i = int(t0 * FPS) + f
            if i < n: env[i] = max(env[i], min(1.0, rms))
    return env
ENV4 = None
def LEVEL4(t):
    i = int(t * FPS)
    return ENV4[i] if ENV4 and i < len(ENV4) else 0

def mixdown(cues, dur, out):
    args, flt = [], []
    for i, (t0, k) in enumerate(cues):
        args += ["-i", str(NAR / f"{k}.wav")]
        ms = int(t0 * 1000); flt.append(f"[{i}:a]adelay={ms}|{ms},aresample=48000[a{i}]")
    flt.append("".join(f"[a{i}]" for i in range(len(cues))) + f"amix=inputs={len(cues)}:normalize=0,apad,atrim=0:{dur},"
               "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[o]")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args, "-filter_complex", ";".join(flt), "-map", "[o]",
                    "-ac", "2", str(out)], check=True)

def encode(fn, dur, out, audio=None):
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-"]
    if audio: cmd += ["-i", str(audio)]
    else: cmd += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
            "-shortest", "-movflags", "+faststart", str(out)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(int(round(dur * FPS))): p.stdin.write(fn(f / FPS))
    p.stdin.close(); assert p.wait() == 0
    print("wrote", out, flush=True)

def main():
    global ENV4
    jobs = sys.argv[2:] or ["part2", "part4", "part5", "cards"]
    ENV4 = load_level(P4, P4_DUR)
    for j in jobs:
        if j.startswith("still:"):
            _, part, ts = j.split(":")
            fn = {"part2": part2, "part4": part4, "part5": part5}.get(part) or card(int(part[4:]))
            Image.frombytes("RGB", (W, H), fn(float(ts))).save(OUT / f"still_{part}_{ts}.png")
        elif j == "part2":
            mixdown(P2, P2_DUR, OUT / "p2.wav"); encode(part2, P2_DUR, OUT / "2_explainer.mp4", OUT / "p2.wav")
        elif j == "part4":
            mixdown(P4, P4_DUR, OUT / "p4.wav"); encode(part4, P4_DUR, OUT / "4_how_it_works.mp4", OUT / "p4.wav")
        elif j == "part5":
            encode(part5, P5_DUR, OUT / "5_credits.mp4")
        elif j == "cards":
            for i in range(7): encode(card(i), 2.0, OUT / f"3_{i + 1}_card.mp4")

main()
