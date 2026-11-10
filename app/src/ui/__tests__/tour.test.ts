import { CLIPS } from '../../audio/clips.generated';
import { LANGS } from '../../core/lang';
import { cardAtTop, targetRect, TOUR } from '../tour';

const screens = [
  { width: 412, height: 915 },
  { width: 360, height: 800 },
];

test('every tour line exists in every language, under the TTS length limit', () => {
  for (const lang of LANGS) {
    for (const s of TOUR) {
      expect(CLIPS[lang][s.key].text.length).toBeGreaterThan(10);
      expect(CLIPS[lang][s.key].text.length).toBeLessThanOrEqual(200);
    }
  }
});

test.each(screens)('every highlight fits on a $width × $height screen', (screen) => {
  for (const s of TOUR) {
    const r = targetRect(s.target, screen, 40);
    if (!r) continue;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.width).toBeGreaterThan(20);
    expect(r.height).toBeGreaterThan(20);
    expect(r.x + r.width).toBeLessThanOrEqual(screen.width);
    expect(r.y + r.height).toBeLessThanOrEqual(screen.height);
  }
});

test('the card sits away from the highlight', () => {
  const s = screens[0];
  expect(cardAtTop(targetRect('captions', s, 40), s.height)).toBe(true);
  expect(cardAtTop(targetRect('strip', s, 40), s.height)).toBe(false);
  expect(cardAtTop(null, s.height)).toBe(false);
});
