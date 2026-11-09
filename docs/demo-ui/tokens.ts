// Drishti demo UI: final design tokens (from docs/demo-ui/Sheet-Tokens.dc.html).
// Spec item F12. All colours verified on the worst case: scrim over a white feed.

export const colors = {
  bg: '#000000',
  scrim: 'rgba(0,0,0,0.78)', // caption panel, strip, latency card, bubbles, toasts
  scrimLight: 'rgba(0,0,0,0.55)', // temple strips at rest
  text: '#FFFFFF',
  text2: '#C7C7CC', // English line, secondary labels
  text3: '#A8A8AE', // hints, units
  brand: '#4CCFE6', // wordmark, listening, ANSWER tag, thinking bar
  listen: '#4CCFE6', // = brand
  alertFar: '#FFD400',
  alertNear: '#FF3B30',
  known: '#34C759',
  unknown: '#A8A8AE', // always with a dashed outline
  offline: '#FF9F0A',
  online: '#30D158',
  tagInk: '#000000', // text on every filled tag / source pill
} as const;

export const fonts = {
  // Noto Sans first, script faces fall through per glyph.
  text: ['NotoSans', 'NotoSansDevanagari', 'NotoSansTamil'],
  mono: 'JetBrainsMono',
} as const;

// sp. lineHeight is a multiplier.
export const type = {
  caption1: { fontSize: 26, fontWeight: '600', lineHeight: { latin: 1.3, devanagari: 1.45, tamil: 1.5 } },
  caption2: { fontSize: 18, fontWeight: '400', lineHeight: 1.35 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, uppercase: true },
  tagKnown: { fontSize: 15, fontWeight: '700', letterSpacing: 0.5, uppercase: true },
  mono: { fontSize: 13, fontWeight: '500' },
  monoLg: { fontSize: 22, fontWeight: '600' },
  bubble: { fontSize: 15, fontWeight: '500' },
  title: { fontSize: 20, fontWeight: '700' },
  titleCane: { fontSize: 30, fontWeight: '700' }, // first-run cane line
} as const;

// dp
export const shape = {
  radiusPanel: 12,
  radiusChip: 999,
  radiusBox: 4,
  strokeFar: 2,
  strokeNear: 3,
  strokeKnown: 3,
  strokeUnknown: 2, // dashed
  margin: 16,
  stripTop: 40,
  stripMinHeight: 44,
  templeWidth: 48,
  latencyCardWidth: 168,
  latencyCardRight: 56,
  dockBottom: 28,
} as const;

// ms
export const motion = {
  captionIn: 150,
  captionOut: 250,
  alertPulse: 300,
  listenGlowLoop: 1200,
  feedback: 600,
  captionHold: 6000,
  toast: 3000,
  modeToast: 1000,
  langChipFlash: 300,
} as const;
