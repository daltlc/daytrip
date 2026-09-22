/* Daytrip — the drawing half: pixel art, scenery, weather, the road and the
   frame itself. Every function here takes the game and only reads it, apart
   from the weather particles it owns outright. game.js never calls into this
   file from update(), so nothing drawn here can move the car or end a run. */
import { W, H, ROAD_X, ROAD_W, CAR_Y } from './geom.js';

/* ---------- pixel art ---------- */
export const DEFAULT_SPRITE = {
  w: 16, h: 24,
  palette: { a: 'ACCENT', k: '#111318', w: '#e9eef5', b: '#8fd3ff', r: '#ff3b3b', l: 'ACCENT_LIGHT' },
  rows: [
    '.....aaaaaa.....', '....aaaaaaaa....', '...aaaaaaaaaa...', '.kkaaaaaaaaaakk.',
    '.kkaaalaaaaaakk.', '.kkaaalaaaaaakk.', '..aaaalaaaaaaa..', '..aabbbbbbbbaa..',
    '..abbbbbbbbbba..', '..abkkkkkkkkba..', '..aakkkkkkkkaa..', '..aaaalaaaaaaa..',
    '..aaaalaaaaaaa..', '..aaaalaaaaaaa..', '..aaaaaaaaaaaa..', '.kkaaaaaaaaaakk.',
    '.kkaaalaaaaaakk.', '.kkaaalaaaaaakk.', '..aaaaaaaaaaaa..', '..arraaaaaarra..',
    '..arraaaaaarra..', '..aaaaaaaaaaaa..', '...kkkkkkkkkk...', '................',
  ],
};
function lighten(hex, amt = 0.35) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
  const n = parseInt(m[1], 16), c = i => Math.min(255, Math.round(((n >> i) & 255) + (255 - ((n >> i) & 255)) * amt));
  return '#' + [16, 8, 0].map(i => c(i).toString(16).padStart(2, '0')).join('');
}
export function buildSprite(sp, accent) {
  const c = document.createElement('canvas'); c.width = sp.w; c.height = sp.h;
  const g = c.getContext('2d'); const pal = sp.palette || {};
  sp.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]; if (ch === '.' || !pal[ch]) continue;
      let col = pal[ch]; if (col === 'ACCENT') col = accent; else if (col === 'ACCENT_LIGHT') col = lighten(accent);
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}
function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
const OBSTACLES = {
  cone: g => { px(g, 5, 1, 2, 2, '#ff7a00'); px(g, 4, 3, 4, 2, '#ff7a00'); px(g, 4, 5, 4, 1, '#fff'); px(g, 3, 6, 6, 3, '#ff7a00'); px(g, 2, 9, 8, 2, '#ff7a00'); px(g, 1, 11, 10, 1, '#c04f00'); },
  barrel: g => { px(g, 2, 1, 8, 10, '#3b82f6'); px(g, 2, 3, 8, 1, '#1e3a8a'); px(g, 2, 8, 8, 1, '#1e3a8a'); px(g, 3, 0, 6, 1, '#60a5fa'); px(g, 3, 11, 6, 1, '#1e3a8a'); },
  tire: g => { px(g, 3, 0, 6, 12, '#111'); px(g, 1, 2, 10, 8, '#111'); px(g, 0, 3, 12, 6, '#111'); px(g, 4, 4, 4, 4, '#444'); px(g, 5, 5, 2, 2, '#777'); },
  rock: g => { px(g, 3, 2, 6, 8, '#7c7f86'); px(g, 1, 4, 10, 5, '#7c7f86'); px(g, 4, 1, 3, 1, '#a3a7ae'); px(g, 2, 4, 2, 2, '#a3a7ae'); px(g, 2, 9, 8, 2, '#4b4e55'); },
  snow: g => { px(g, 3, 3, 6, 7, '#eaf4ff'); px(g, 1, 5, 10, 4, '#eaf4ff'); px(g, 4, 2, 3, 1, '#fff'); px(g, 2, 9, 8, 2, '#b9d3ea'); },
  crate: g => { px(g, 1, 1, 10, 10, '#b5742a'); px(g, 1, 1, 10, 1, '#d99a4a'); px(g, 1, 1, 1, 10, '#d99a4a'); px(g, 1, 10, 10, 1, '#7a4a15'); px(g, 10, 1, 1, 10, '#7a4a15'); for (let i = 0; i < 8; i++) { px(g, 2 + i, 2 + i, 1, 1, '#7a4a15'); px(g, 9 - i, 2 + i, 1, 1, '#7a4a15'); } },
  puddle: g => { px(g, 2, 3, 8, 6, '#2d6cdf'); px(g, 0, 5, 12, 3, '#2d6cdf'); px(g, 3, 4, 3, 1, '#9cc4ff'); px(g, 7, 7, 2, 1, '#9cc4ff'); },
};
export function buildObstacle(type) {
  const c = document.createElement('canvas'); c.width = 12; c.height = 12;
  (OBSTACLES[type] || OBSTACLES.cone)(c.getContext('2d')); return c;
}

/* ---------- scenery (top-down side strips, two parallax layers) ---------- */
export const SCENERY = {
  forest:   { ground: '#1f3d22', far: '#254a29', items: (g, x, y, k) => { const s = 5 + (k % 3); px(g, x - s, y - s, s * 2, s * 2, '#2f6b35'); px(g, x - s + 1, y - s + 1, s, s, '#3d8a45'); } },
  city:     { ground: '#2a2d33', far: '#33373e', items: (g, x, y, k) => { const w = 8 + (k % 3) * 2, h = 10 + (k % 4) * 3; px(g, x - w / 2, y - h / 2, w, h, '#4a4f58'); for (let i = 1; i < h - 1; i += 3) for (let j = 1; j < w - 1; j += 3) px(g, x - w / 2 + j, y - h / 2 + i, 1, 1, (k + i + j) % 3 ? '#ffd76b' : '#2a2d33'); } },
  mountain: { ground: '#4b3d32', far: '#5a4a3d', items: (g, x, y, k) => { const s = 6 + (k % 4); px(g, x - s, y - 2, s * 2, 4, '#6f5d4c'); px(g, x - s + 2, y - 5, s * 2 - 4, 4, '#857160'); px(g, x - 2, y - 7, 4, 3, '#a89482'); } },
  desert:   { ground: '#c9a25c', far: '#d4b06c', items: (g, x, y, k) => { px(g, x - 1, y - 6, 3, 12, '#3f7a3b'); if (k % 2) px(g, x - 4, y - 3, 3, 2, '#3f7a3b'), px(g, x - 4, y - 6, 2, 4, '#3f7a3b'); else px(g, x + 2, y - 2, 3, 2, '#3f7a3b'), px(g, x + 3, y - 5, 2, 4, '#3f7a3b'); } },
  coast:    { ground: '#e3cf9a', far: '#1e6fb5', items: (g, x, y, k) => { if (x < 80) { px(g, x - 5, y, 8, 1, '#8fd0ff'); px(g, x - 2, y + 3, 6, 1, '#8fd0ff'); } else { px(g, x - 1, y - 6, 2, 10, '#8a5a2b'); px(g, x - 5, y - 8, 10, 3, '#2f8f3e'); px(g, x - 3, y - 10, 6, 2, '#2f8f3e'); } } },
  track:    { ground: '#6b6f76', far: '#7d828a', items: (g, x, y, k) => { if (k % 3 === 0) { px(g, x - 7, y - 6, 14, 12, '#3a3d44'); for (let i = 0; i < 4; i++) px(g, x - 6, y - 5 + i * 3, 12, 1, (k + i) % 2 ? '#e33' : '#fff'); } else { px(g, x - 4, y - 4, 8, 8, '#5b5f66'); px(g, x - 3, y - 3, 6, 6, '#8a8f97'); } } },
  snow:     { ground: '#e6eef6', far: '#f2f6fa', items: (g, x, y, k) => { const s = 4 + (k % 3); px(g, x - s, y + 2, s * 2, 3, '#1f3a2a'); px(g, x - s + 1, y - 1, s * 2 - 2, 3, '#25482f'); px(g, x - s + 2, y - 4, s * 2 - 4, 3, '#2f5c3a'); px(g, x - 1, y - 6, 2, 2, '#2f5c3a'); px(g, x - s + 1, y - 1, s * 2 - 2, 1, '#fff'); } },
};
const hash = n => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return x / 4294967296; };

/* ---------- weather (a drifting particle layer over everything) ---------- */
// Three sceneries get weather on their own: `coast` rains, `snow` snows, `desert` blows
// dust. A day can override with the optional `game.weather` — "auto" (the default, i.e.
// whatever SCENERY_WEATHER says), "none", or a kind by name so a dry coast or a snowy
// mountain pass is still possible. Old day files have no field and get "auto", so they
// render exactly as before unless their scenery is one of the three.
// `fall` is px/s of its own; `tow` is how much of the road speed the particle picks up,
// which is what makes rain lean into a fast run and leaves snow hanging almost still.
// Nothing here is read by update(): it cannot be hit and it does not move the car.
export const WEATHER = {
  rain: { count: 44, fall: 210, tow: 0.85, drift: -18, len: 5, wobble: 0, color: 'rgba(176,206,240,.55)' },
  snow: { count: 38, fall: 26, tow: 0.12, drift: 8, len: 1, wobble: 11, color: 'rgba(255,255,255,.85)' },
  dust: { count: 30, fall: 48, tow: 0.45, drift: 44, len: 2, wobble: 5, color: 'rgba(224,192,130,.5)' },
};
export const SCENERY_WEATHER = { coast: 'rain', snow: 'snow', desert: 'dust' };
export function newDrop(game, spread) {
  const c = game.weather;
  return { x: Math.random() * (W + 24) - 12, y: spread ? Math.random() * H : -c.len - Math.random() * 24, s: 0.7 + Math.random() * 0.6, ph: Math.random() * Math.PI * 2 };
}
// Runs every frame, not only while driving, so the idle and crash cards sit in weather too.
export function stepWeather(game, dt) {
  const c = game.weather; if (!c) return;
  const tow = c.tow * (game.state === 'running' ? game.speed : game.baseSpeed * 0.4);
  for (const p of game.drops) {
    p.y += (c.fall * p.s + tow) * dt;
    p.x += (c.drift * p.s + (c.wobble ? Math.cos(game.tick * 1.7 + p.ph) * c.wobble : 0)) * dt;
    if (p.y > H) Object.assign(p, newDrop(game, false));
    else if (p.x < -12) p.x = W + 12;
    else if (p.x > W + 12) p.x = -12;
  }
}

/* ---------- road curvature ---------- */
// The whole road slides left and right on one slow sine wave so a long run stops feeling
// like a straight corridor. It is purely cosmetic. The shift depends on `y - scroll`, i.e.
// where a row sits along the road rather than on the screen, so a road feature keeps its
// own offset as it scrolls past and the car and an obstacle at the same y are always
// shifted by the same amount. Everything the player can hit stays in unbent lane space:
// collision and near misses are untouched — which is exactly why these two functions live
// on this side of the split, where update() cannot reach them. 13 px of swing keeps the
// 104 px road inside the 160 px frame with its edge lines intact.
export const BEND_MAX = 13;
const BEND_WAVE = 760;
export function bend(game, y) { return game.curve ? game.curve * Math.sin((y - game.scroll) * (Math.PI * 2 / BEND_WAVE)) : 0; }
function bendPx(game, y) { return Math.round(bend(game, y)); }

/* ---------- the frame ---------- */
// How faint the pace ghost of the day's best run is drawn. The trace behind it is
// recorded and stored by the game; all this side does is paint it.
const GHOST_ALPHA = 0.32;
export function draw(game) {
  const g = game.g, sc = game.scenery, s = game.scroll, bends = game.bends;
  if (game.curve) for (let y = 0; y < H; y++) bends[y] = bendPx(game, y); // else it stays all zeros

  const at = y => bends[y < 0 ? 0 : y > H - 1 ? H - 1 : Math.round(y)];
  g.fillStyle = sc.ground; g.fillRect(0, 0, W, H);
  g.fillStyle = sc.far;
  for (let i = 0; i < 12; i++) { const y = ((i * 40 + s * 0.5) % (H + 40)) - 20, b = at(y); g.fillRect(0, y, ROAD_X - 6 + b, 6); g.fillRect(ROAD_X + ROAD_W + 6 + b, y, W, 6); }
  for (let i = 0; i < 14; i++) {
    const y = ((i * 46 + s) % (H + 60)) - 30, side = i % 2 ? 1 : -1;
    const x = side < 0 ? 4 + Math.floor(hash(i) * 14) : ROAD_X + ROAD_W + 6 + Math.floor(hash(i + 99) * 14);
    sc.items(g, x + at(y), y, i + 7);
  }
  if (game.curve) {
    g.fillStyle = '#c9ccd2';
    for (let y = 0; y < H; y++) { const b = bends[y]; g.fillRect(ROAD_X - 3 + b, y, 3, 1); g.fillRect(ROAD_X + ROAD_W + b, y, 3, 1); }
    g.fillStyle = '#3a3d44';
    for (let y = 0; y < H; y++) g.fillRect(ROAD_X + bends[y], y, ROAD_W, 1);
  } else {
    g.fillStyle = '#c9ccd2'; g.fillRect(ROAD_X - 3, 0, 3, H); g.fillRect(ROAD_X + ROAD_W, 0, 3, H);
    g.fillStyle = '#3a3d44'; g.fillRect(ROAD_X, 0, ROAD_W, H);
  }
  g.fillStyle = '#5a5e66'; for (let i = 0; i < 40; i++) { const y = ((i * 37 + s * 1.0) % (H + 10)) - 5; g.fillRect(ROAD_X + Math.floor(hash(i + 300) * ROAD_W) + at(y), y, 1, 1); }
  g.fillStyle = '#e8e8e8';
  for (let l = 1; l < game.lanes; l++) { const x = Math.round(ROAD_X + game.laneW * l) - 1; for (let i = -1; i < 12; i++) { const y = ((i * 24 + s) % (H + 24)) - 12; g.fillRect(x + at(y + 6), y, 2, 12); } }
  for (const o of game.obs) g.drawImage(game.obst, Math.round(game.laneCenter(o.lane) - 6 + bend(game, o.y + 6)), Math.round(o.y));
  for (const sp of game.sparks) { g.fillStyle = sp.t > 0.14 ? '#ffffff' : game.accent; g.fillRect(Math.round(sp.x + bend(game, sp.y)), Math.round(sp.y), 1, 1); }
  const cb = bend(game, CAR_Y + 12);
  // Under the car, so you can always see yourself; it shares the car's bend, since it is
  // the same road at the same y. It is a picture and nothing else: it cannot be hit.
  const gx = game.state === 'running' ? game.ghostX(game.dist) : null;
  if (gx != null) {
    g.globalAlpha = GHOST_ALPHA;
    g.drawImage(game.sprite, Math.round(gx - 8 + cb), CAR_Y);
    g.globalAlpha = 1;
  }
  if (game.state === 'crashed') { g.fillStyle = 'rgba(255,60,60,.35)'; g.fillRect(Math.round(game.carX - 9 + cb), CAR_Y - 3, 18, 30); }
  g.drawImage(game.sprite, Math.round(game.carX - 8 + cb), CAR_Y);
  if (game.state === 'running' && game.speed > game.baseSpeed * 1.6 && Math.floor(game.tick * 20) % 2) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(Math.round(game.carX - 4 + cb), CAR_Y + 24, 2, 5); g.fillRect(Math.round(game.carX + 2 + cb), CAR_Y + 24, 2, 5); }
  if (game.weather) { // last, so it falls in front of the car as well as the road
    const c = game.weather; g.fillStyle = c.color;
    for (const p of game.drops) g.fillRect(Math.round(p.x), Math.round(p.y), 1, Math.max(1, Math.round(c.len * p.s)));
  }
  const d = game.dctx, k = game.canvas.width / W;
  const ox = game.shake ? Math.round((Math.random() - 0.5) * 6 * k) : 0, oy = game.shake ? Math.round((Math.random() - 0.5) * 6 * k) : 0;
  d.imageSmoothingEnabled = false;
  d.fillStyle = '#000'; d.fillRect(0, 0, game.canvas.width, game.canvas.height);
  d.drawImage(game.buf, ox, oy, game.canvas.width, game.canvas.height);
}
