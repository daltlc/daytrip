// @ts-check
/* Daytrip — the drawing half: pixel art, scenery, weather, the road and the frame itself.
   Every function here takes the game and only reads it, apart from the weather particles it
   owns outright. game.js never calls into this file from update(), so nothing drawn here can
   move the car or end a run. */
/** @import { Sprite, ObstacleKind, SceneryKind, WeatherKind, Scenery, Weather, Drop } from './types.js' */
/** @import { Game } from './game.js' */
import { ctx2d } from './dom.js';
import { W, H, ROAD_X, ROAD_W, CAR_Y } from './geom.js';

/* ---------- pixel art ---------- */
const SPRITE_W = 16;
const SPRITE_H = 24;
const OBSTACLE_PX = 12;
const ACCENT_TOKEN = 'ACCENT';
const ACCENT_LIGHT_TOKEN = 'ACCENT_LIGHT';
const LIGHTEN_AMOUNT = 0.35;

/** @type {Sprite} */
export const DEFAULT_SPRITE = {
  w: SPRITE_W, h: SPRITE_H,
  palette: { a: ACCENT_TOKEN, k: '#111318', w: '#e9eef5', b: '#8fd3ff', r: '#ff3b3b', l: ACCENT_LIGHT_TOKEN },
  rows: [
    '.....aaaaaa.....', '....aaaaaaaa....', '...aaaaaaaaaa...', '.kkaaaaaaaaaakk.',
    '.kkaaalaaaaaakk.', '.kkaaalaaaaaakk.', '..aaaalaaaaaaa..', '..aabbbbbbbbaa..',
    '..abbbbbbbbbba..', '..abkkkkkkkkba..', '..aakkkkkkkkaa..', '..aaaalaaaaaaa..',
    '..aaaalaaaaaaa..', '..aaaalaaaaaaa..', '..aaaaaaaaaaaa..', '.kkaaaaaaaaaakk.',
    '.kkaaalaaaaaakk.', '.kkaaalaaaaaakk.', '..aaaaaaaaaaaa..', '..arraaaaaarra..',
    '..arraaaaaarra..', '..aaaaaaaaaaaa..', '...kkkkkkkkkk...', '................',
  ],
};

/**
 * @param {string} hex `#rrggbb`
 * @param {number} [amount] 0–1 toward white
 * @returns {string}
 */
function lighten(hex, amount = LIGHTEN_AMOUNT) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const rgb = parseInt(match[1], 16);
  const channel = (/** @type {number} */ shift) => {
    const value = (rgb >> shift) & 255;
    return Math.min(255, Math.round(value + (255 - value) * amount)).toString(16).padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/**
 * The one guard on a day file's sprite. A missing, zero-sized or row-less sprite would make a
 * 0×0 canvas that throws inside the drawImage that follows, so both the game and the car card
 * go through here and get the default instead.
 * @param {Sprite | undefined} sprite
 * @returns {Sprite}
 */
export const usableSprite = sprite =>
  sprite && sprite.w > 0 && sprite.h > 0 && Array.isArray(sprite.rows) && sprite.rows.length > 0 ? sprite : DEFAULT_SPRITE;

/**
 * @param {Sprite | undefined} raw
 * @param {string} accent `#rrggbb`
 * @returns {HTMLCanvasElement}
 */
export function buildSprite(raw, accent) {
  const sprite = usableSprite(raw);
  const canvas = document.createElement('canvas');
  canvas.width = sprite.w;
  canvas.height = sprite.h;
  const g = ctx2d(canvas);
  const palette = sprite.palette ?? {};
  const accentLight = lighten(accent);
  sprite.rows.forEach((row, y) => {
    if (typeof row !== 'string') return;
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]];
      if (!color) continue;
      g.fillStyle = color === ACCENT_TOKEN ? accent : color === ACCENT_LIGHT_TOKEN ? accentLight : color;
      g.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
}

/**
 * @param {CanvasRenderingContext2D} g
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} color
 */
function px(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

/** @type {Record<ObstacleKind, (g: CanvasRenderingContext2D) => void>} */
const OBSTACLES = {
  cone: g => { px(g, 5, 1, 2, 2, '#ff7a00'); px(g, 4, 3, 4, 2, '#ff7a00'); px(g, 4, 5, 4, 1, '#fff'); px(g, 3, 6, 6, 3, '#ff7a00'); px(g, 2, 9, 8, 2, '#ff7a00'); px(g, 1, 11, 10, 1, '#c04f00'); },
  barrel: g => { px(g, 2, 1, 8, 10, '#3b82f6'); px(g, 2, 3, 8, 1, '#1e3a8a'); px(g, 2, 8, 8, 1, '#1e3a8a'); px(g, 3, 0, 6, 1, '#60a5fa'); px(g, 3, 11, 6, 1, '#1e3a8a'); },
  tire: g => { px(g, 3, 0, 6, 12, '#111'); px(g, 1, 2, 10, 8, '#111'); px(g, 0, 3, 12, 6, '#111'); px(g, 4, 4, 4, 4, '#444'); px(g, 5, 5, 2, 2, '#777'); },
  rock: g => { px(g, 3, 2, 6, 8, '#7c7f86'); px(g, 1, 4, 10, 5, '#7c7f86'); px(g, 4, 1, 3, 1, '#a3a7ae'); px(g, 2, 4, 2, 2, '#a3a7ae'); px(g, 2, 9, 8, 2, '#4b4e55'); },
  snow: g => { px(g, 3, 3, 6, 7, '#eaf4ff'); px(g, 1, 5, 10, 4, '#eaf4ff'); px(g, 4, 2, 3, 1, '#fff'); px(g, 2, 9, 8, 2, '#b9d3ea'); },
  crate: g => {
    px(g, 1, 1, 10, 10, '#b5742a'); px(g, 1, 1, 10, 1, '#d99a4a'); px(g, 1, 1, 1, 10, '#d99a4a'); px(g, 1, 10, 10, 1, '#7a4a15'); px(g, 10, 1, 1, 10, '#7a4a15');
    for (let i = 0; i < 8; i++) { px(g, 2 + i, 2 + i, 1, 1, '#7a4a15'); px(g, 9 - i, 2 + i, 1, 1, '#7a4a15'); }
  },
  puddle: g => { px(g, 2, 3, 8, 6, '#2d6cdf'); px(g, 0, 5, 12, 3, '#2d6cdf'); px(g, 3, 4, 3, 1, '#9cc4ff'); px(g, 7, 7, 2, 1, '#9cc4ff'); },
};

/**
 * @param {ObstacleKind | undefined} kind
 * @returns {HTMLCanvasElement}
 */
export function buildObstacle(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = OBSTACLE_PX;
  canvas.height = OBSTACLE_PX;
  (kind && OBSTACLES[kind] ? OBSTACLES[kind] : OBSTACLES.cone)(ctx2d(canvas));
  return canvas;
}

/* ---------- scenery (top-down side strips, two parallax layers) ---------- */
/** @type {Record<SceneryKind, Scenery>} */
export const SCENERY = {
  forest: { ground: '#1f3d22', far: '#254a29', items: (g, x, y, k) => { const s = 5 + (k % 3); px(g, x - s, y - s, s * 2, s * 2, '#2f6b35'); px(g, x - s + 1, y - s + 1, s, s, '#3d8a45'); } },
  city: { ground: '#2a2d33', far: '#33373e', items: (g, x, y, k) => {
    const w = 8 + (k % 3) * 2, h = 10 + (k % 4) * 3;
    px(g, x - w / 2, y - h / 2, w, h, '#4a4f58');
    for (let i = 1; i < h - 1; i += 3) for (let j = 1; j < w - 1; j += 3) px(g, x - w / 2 + j, y - h / 2 + i, 1, 1, (k + i + j) % 3 ? '#ffd76b' : '#2a2d33');
  } },
  mountain: { ground: '#4b3d32', far: '#5a4a3d', items: (g, x, y, k) => { const s = 6 + (k % 4); px(g, x - s, y - 2, s * 2, 4, '#6f5d4c'); px(g, x - s + 2, y - 5, s * 2 - 4, 4, '#857160'); px(g, x - 2, y - 7, 4, 3, '#a89482'); } },
  desert: { ground: '#c9a25c', far: '#d4b06c', items: (g, x, y, k) => {
    px(g, x - 1, y - 6, 3, 12, '#3f7a3b');
    if (k % 2) { px(g, x - 4, y - 3, 3, 2, '#3f7a3b'); px(g, x - 4, y - 6, 2, 4, '#3f7a3b'); }
    else { px(g, x + 2, y - 2, 3, 2, '#3f7a3b'); px(g, x + 3, y - 5, 2, 4, '#3f7a3b'); }
  } },
  coast: { ground: '#e3cf9a', far: '#1e6fb5', items: (g, x, y) => {
    if (x < 80) { px(g, x - 5, y, 8, 1, '#8fd0ff'); px(g, x - 2, y + 3, 6, 1, '#8fd0ff'); }
    else { px(g, x - 1, y - 6, 2, 10, '#8a5a2b'); px(g, x - 5, y - 8, 10, 3, '#2f8f3e'); px(g, x - 3, y - 10, 6, 2, '#2f8f3e'); }
  } },
  track: { ground: '#6b6f76', far: '#7d828a', items: (g, x, y, k) => {
    if (k % 3 === 0) { px(g, x - 7, y - 6, 14, 12, '#3a3d44'); for (let i = 0; i < 4; i++) px(g, x - 6, y - 5 + i * 3, 12, 1, (k + i) % 2 ? '#e33' : '#fff'); }
    else { px(g, x - 4, y - 4, 8, 8, '#5b5f66'); px(g, x - 3, y - 3, 6, 6, '#8a8f97'); }
  } },
  snow: { ground: '#e6eef6', far: '#f2f6fa', items: (g, x, y, k) => {
    const s = 4 + (k % 3);
    px(g, x - s, y + 2, s * 2, 3, '#1f3a2a'); px(g, x - s + 1, y - 1, s * 2 - 2, 3, '#25482f'); px(g, x - s + 2, y - 4, s * 2 - 4, 3, '#2f5c3a'); px(g, x - 1, y - 6, 2, 2, '#2f5c3a'); px(g, x - s + 1, y - 1, s * 2 - 2, 1, '#fff');
  } },
};

/**
 * Deterministic 0–1 noise so scenery items keep their place from frame to frame.
 * @param {number} n
 * @returns {number}
 */
function hash(n) {
  let x = Math.imul(n, 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return x / 4294967296;
}

/* ---------- weather (a drifting particle layer over everything) ---------- */
// `fall` is px/s of its own; `tow` is how much of the road speed a particle picks up, which is
// what makes rain lean into a fast run and leaves snow hanging almost still. Nothing here is
// read by update(): weather cannot be hit and does not move the car.
/** @type {Record<WeatherKind, Weather>} */
export const WEATHER = {
  rain: { count: 44, fall: 210, tow: 0.85, drift: -18, len: 5, wobble: 0, color: 'rgba(176,206,240,.55)' },
  snow: { count: 38, fall: 26, tow: 0.12, drift: 8, len: 1, wobble: 11, color: 'rgba(255,255,255,.85)' },
  dust: { count: 30, fall: 48, tow: 0.45, drift: 44, len: 2, wobble: 5, color: 'rgba(224,192,130,.5)' },
};
/** @type {Partial<Record<SceneryKind, WeatherKind>>} */
export const SCENERY_WEATHER = { coast: 'rain', snow: 'snow', desert: 'dust' };
const DROP_MARGIN = 12;
const IDLE_TOW = 0.4;
const WOBBLE_RATE = 1.7;

/**
 * @param {Weather} weather
 * @param {boolean} spread true to scatter over the whole frame, false to start above it
 * @returns {Drop}
 */
export function newDrop(weather, spread) {
  return {
    x: Math.random() * (W + DROP_MARGIN * 2) - DROP_MARGIN,
    y: spread ? Math.random() * H : -weather.len - Math.random() * 24,
    s: 0.7 + Math.random() * 0.6,
    ph: Math.random() * Math.PI * 2,
  };
}

/**
 * Runs every frame, not only while driving, so the idle and crash cards sit in weather too.
 * @param {Game} game
 * @param {number} dt seconds
 */
export function stepWeather(game, dt) {
  const weather = game.weather;
  if (!weather) return;
  const tow = weather.tow * (game.state === 'running' ? game.speed : game.baseSpeed * IDLE_TOW);
  const wobbleBase = game.tick * WOBBLE_RATE;
  for (const p of game.drops) {
    p.y += (weather.fall * p.s + tow) * dt;
    p.x += (weather.drift * p.s + (weather.wobble ? Math.cos(wobbleBase + p.ph) * weather.wobble : 0)) * dt;
    if (p.y > H) Object.assign(p, newDrop(weather, false));
    else if (p.x < -DROP_MARGIN) p.x = W + DROP_MARGIN;
    else if (p.x > W + DROP_MARGIN) p.x = -DROP_MARGIN;
  }
}

/* ---------- road curvature ---------- */
// The whole road slides sideways on one slow sine wave, purely cosmetically. The shift depends
// on `y - scroll` (where a row sits along the road, not on the screen), so a feature keeps its
// offset as it scrolls past and the car and an obstacle at the same y shift by the same amount.
// Collision and near misses stay in unbent lane space. 13 px of swing keeps the 104 px road
// inside the 160 px frame with its edge lines intact.
export const BEND_MAX = 13;
const BEND_WAVE = 760;
const BEND_K = (Math.PI * 2) / BEND_WAVE;

/**
 * @param {Game} game
 * @param {number} y
 * @returns {number}
 */
export function bend(game, y) {
  return game.curve ? game.curve * Math.sin((y - game.scroll) * BEND_K) : 0;
}

/* ---------- the frame ---------- */
const GHOST_ALPHA = 0.32;
const ROAD_COLOR = '#3a3d44';
const EDGE_COLOR = '#c9ccd2';
const GRIT_COLOR = '#5a5e66';
const LANE_COLOR = '#e8e8e8';
const CRASH_TINT = 'rgba(255,60,60,.35)';
const EXHAUST = 'rgba(255,255,255,.35)';
const SHAKE_PX = 6;
const SPRITE_HALF_W = 8;
const SPARK_FLASH_T = 0.14;

/**
 * Render one frame of the game into its buffer, then blit the buffer to the display canvas.
 * @param {Game} game
 */
export function draw(game) {
  const { g, scenery, scroll, bends, lanes, laneW } = game;
  if (game.curve) for (let y = 0; y < H; y++) bends[y] = Math.round(bend(game, y)); // else it stays all zeros
  /** @param {number} y */
  const at = y => bends[y < 0 ? 0 : y > H - 1 ? H - 1 : Math.round(y)];

  g.fillStyle = scenery.ground;
  g.fillRect(0, 0, W, H);
  g.fillStyle = scenery.far;
  for (let i = 0; i < 12; i++) {
    const y = ((i * 40 + scroll * 0.5) % (H + 40)) - 20, b = at(y);
    g.fillRect(0, y, ROAD_X - 6 + b, 6);
    g.fillRect(ROAD_X + ROAD_W + 6 + b, y, W, 6);
  }
  for (let i = 0; i < 14; i++) {
    const y = ((i * 46 + scroll) % (H + 60)) - 30;
    const x = i % 2 ? ROAD_X + ROAD_W + 6 + Math.floor(hash(i + 99) * 14) : 4 + Math.floor(hash(i) * 14);
    scenery.items(g, x + at(y), y, i + 7);
  }
  if (game.curve) {
    g.fillStyle = EDGE_COLOR;
    for (let y = 0; y < H; y++) { const b = bends[y]; g.fillRect(ROAD_X - 3 + b, y, 3, 1); g.fillRect(ROAD_X + ROAD_W + b, y, 3, 1); }
    g.fillStyle = ROAD_COLOR;
    for (let y = 0; y < H; y++) g.fillRect(ROAD_X + bends[y], y, ROAD_W, 1);
  } else {
    g.fillStyle = EDGE_COLOR;
    g.fillRect(ROAD_X - 3, 0, 3, H);
    g.fillRect(ROAD_X + ROAD_W, 0, 3, H);
    g.fillStyle = ROAD_COLOR;
    g.fillRect(ROAD_X, 0, ROAD_W, H);
  }
  g.fillStyle = GRIT_COLOR;
  for (let i = 0; i < 40; i++) {
    const y = ((i * 37 + scroll) % (H + 10)) - 5;
    g.fillRect(ROAD_X + Math.floor(hash(i + 300) * ROAD_W) + at(y), y, 1, 1);
  }
  g.fillStyle = LANE_COLOR;
  for (let l = 1; l < lanes; l++) {
    const x = Math.round(ROAD_X + laneW * l) - 1;
    for (let i = -1; i < 12; i++) { const y = ((i * 24 + scroll) % (H + 24)) - 12; g.fillRect(x + at(y + 6), y, 2, 12); }
  }
  for (const o of game.obs) g.drawImage(game.obst, Math.round(game.laneCenter(o.lane) - 6 + bend(game, o.y + 6)), Math.round(o.y));
  for (const s of game.sparks) {
    g.fillStyle = s.t > SPARK_FLASH_T ? '#ffffff' : game.accent;
    g.fillRect(Math.round(s.x + bend(game, s.y)), Math.round(s.y), 1, 1);
  }
  const roadBend = bend(game, CAR_Y + 12);
  const carBend = roadBend + game.slide; // slide: drawn overshoot on a low-grip day, 0 otherwise
  // The pace ghost sits under the car so you can always see yourself. It is a picture only.
  const ghostX = game.state === 'running' ? game.ghostX(game.dist) : null;
  if (ghostX !== null) {
    g.globalAlpha = GHOST_ALPHA;
    g.drawImage(game.sprite, Math.round(ghostX - SPRITE_HALF_W + roadBend), CAR_Y);
    g.globalAlpha = 1;
  }
  if (game.state === 'crashed') { g.fillStyle = CRASH_TINT; g.fillRect(Math.round(game.carX - 9 + carBend), CAR_Y - 3, 18, 30); }
  g.drawImage(game.sprite, Math.round(game.carX - SPRITE_HALF_W + carBend), CAR_Y);
  if (game.state === 'running' && game.speed > game.baseSpeed * 1.6 && Math.floor(game.tick * 20) % 2) {
    g.fillStyle = EXHAUST;
    g.fillRect(Math.round(game.carX - 4 + carBend), CAR_Y + SPRITE_H, 2, 5);
    g.fillRect(Math.round(game.carX + 2 + carBend), CAR_Y + SPRITE_H, 2, 5);
  }
  if (game.weather) { // last, so it falls in front of the car as well as the road
    g.fillStyle = game.weather.color;
    const len = game.weather.len;
    for (const p of game.drops) g.fillRect(Math.round(p.x), Math.round(p.y), 1, Math.max(1, Math.round(len * p.s)));
  }

  const { dctx, canvas } = game;
  const scale = canvas.width / W;
  const ox = game.shake ? Math.round((Math.random() - 0.5) * SHAKE_PX * scale) : 0;
  const oy = game.shake ? Math.round((Math.random() - 0.5) * SHAKE_PX * scale) : 0;
  dctx.imageSmoothingEnabled = false;
  dctx.fillStyle = '#000';
  dctx.fillRect(0, 0, canvas.width, canvas.height);
  dctx.drawImage(game.buf, ox, oy, canvas.width, canvas.height);
}
