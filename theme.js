// @ts-check
/* Daytrip — a solid color theme built from the day's livery color. The page takes the car's hue,
   darkens it into the background and card colors, and picks every text color by measured
   contrast, so text stays readable on any livery, from deep navy to bright yellow. No gradients
   and no transparency: every surface is one solid color. */

/** @typedef {{ h: number, s: number, l: number }} Hsl */

const MIN_CONTRAST = 4.5; // WCAG AA for body text
const HL_CONTRAST = 7; // the read-aloud highlight sits under body text, so it keeps a wider margin
const BLACK = '#0a0a0a', WHITE = '#ffffff';
// Lightness (0–100) and the most saturation (0–100) each surface may take from the livery hue.
const SURFACES = {
  bg: { l: 9, s: 42 },
  card: { l: 13, s: 34 },
  card2: { l: 17, s: 28 },
  line: { l: 25, s: 24 },
  text: { l: 95, s: 14 },
  muted: { l: 68, s: 14 },
};
const HL_MIX = 0.38; // how much livery color goes into the read-aloud highlight, before contrast trims it

/**
 * @param {string} hex `#rrggbb`
 * @returns {[number, number, number]} 0–255 channels
 */
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** @param {[number, number, number]} c */
const toHex = c => `#${c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/**
 * WCAG relative luminance.
 * @param {string} hex
 */
function luminance(hex) {
  const [r, g, b] = rgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between two colors, 1–21.
 * @param {string} a
 * @param {string} b
 */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * @param {string} hex
 * @returns {Hsl}
 */
function toHsl(hex) {
  const [r, g, b] = rgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (!d) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

/**
 * @param {Hsl} c
 * @returns {string}
 */
function fromHsl({ h, s, l }) {
  const sat = s / 100, light = l / 100;
  const k = (/** @type {number} */ n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (/** @type {number} */ n) => (light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255;
  return toHex([f(0), f(8), f(4)]);
}

/**
 * The livery hue at a given lightness, its saturation capped so dark surfaces stay calm.
 * @param {Hsl} base
 * @param {{ l: number, s: number }} surface
 */
const tone = (base, surface) => fromHsl({ h: base.h, s: Math.min(base.s, surface.s), l: surface.l });

/**
 * Raise a color's lightness until it reaches `ratio` against every background given.
 * @param {Hsl} start
 * @param {string[]} against
 * @param {number} ratio
 */
function lightenUntil(start, against, ratio) {
  let c = { ...start };
  let hex = fromHsl(c);
  while (c.l < 100 && against.some(bg => contrast(hex, bg) < ratio)) {
    c = { ...c, l: Math.min(100, c.l + 2) };
    hex = fromHsl(c);
  }
  return hex;
}

/**
 * @param {string} a
 * @param {string} b
 * @param {number} t 0 gives `a`, 1 gives `b`
 */
function mix(a, b, t) {
  const x = rgb(a), y = rgb(b);
  /** @param {number} i */
  const at = i => x[i] + (y[i] - x[i]) * t;
  return toHex([at(0), at(1), at(2)]);
}

/**
 * Every color the page uses, solid, derived from one livery color.
 * @param {string} accent `#rrggbb`
 * @returns {Record<string, string>} CSS custom property name → color
 */
export function themeFor(accent) {
  const base = toHsl(accent);
  const bg = tone(base, SURFACES.bg);
  const card = tone(base, SURFACES.card);
  const card2 = tone(base, SURFACES.card2);
  const surfaces = [bg, card, card2];
  const text = lightenUntil({ h: base.h, s: Math.min(base.s, SURFACES.text.s), l: SURFACES.text.l }, surfaces, MIN_CONTRAST);
  const muted = lightenUntil({ h: base.h, s: Math.min(base.s, SURFACES.muted.s), l: SURFACES.muted.l }, surfaces, MIN_CONTRAST);
  // The livery color as text (links, the year) has to clear the dark surfaces too.
  const accentText = lightenUntil(base, surfaces, MIN_CONTRAST);
  // Text set on the livery color itself (the badge, the Listen button). A mid-brightness livery
  // holds neither black nor white well enough, so its fill is nudged lighter (under black text) or
  // darker (under white) until the text reads; the brand dot keeps the exact livery color.
  const accentInk = contrast(accent, BLACK) >= contrast(accent, WHITE) ? BLACK : WHITE;
  let fill = { ...base }, accentFill = accent;
  while (contrast(accentFill, accentInk) < MIN_CONTRAST && fill.l > 0 && fill.l < 100) {
    fill = { ...fill, l: Math.min(100, Math.max(0, fill.l + (accentInk === BLACK ? 1 : -1))) };
    accentFill = fromHsl(fill);
  }
  let t = HL_MIX, hl = mix(card, accent, t);
  while (t > 0 && contrast(text, hl) < HL_CONTRAST) { t = Math.max(0, t - 0.04); hl = mix(card, accent, t); }
  return {
    '--accent': accent, '--accent-fill': accentFill, '--accent-ink': accentInk, '--accent-text': accentText,
    '--bg': bg, '--card': card, '--card-2': card2, '--line': tone(base, SURFACES.line),
    '--text': text, '--muted': muted, '--hl': hl,
  };
}

/**
 * Apply a day's theme to the whole document, including the browser's own UI color.
 * @param {string} accent `#rrggbb`
 */
export function applyTheme(accent) {
  const theme = themeFor(accent);
  for (const [name, value] of Object.entries(theme)) document.documentElement.style.setProperty(name, value);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme['--bg']);
}
