/* Daytrip engine v1 — no dependencies, no build step.
   Loads days/latest.json (or ?d=YYYY-MM-DD), renders the page, reads it aloud,
   and runs a tiny top-down lane-dodge game with the day's pixel sprite.
   Conventions: everything optional in the day file has a fallback here. */
(() => {
'use strict';

/* ---------- tiny DOM helpers ---------- */
const $ = (s, root = document) => root.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};

const CLASS_LABEL = {
  road: 'Road car', exotic: 'Exotic', rally: 'Rally', f1: 'Formula 1', gt3: 'GT3',
  lemans: 'Le Mans', jdm: 'JDM', muscle: 'Muscle', offroad: 'Off-road',
  vintage: 'Vintage', touring: 'Touring car', concept: 'Concept',
};

/* ---------- load ---------- */
async function loadDay() {
  const d = new URLSearchParams(location.search).get('d');
  const file = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `days/${d}.json` : 'days/latest.json';
  const res = await fetch(`${file}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

/* ---------- text helpers ---------- */
const splitSentences = t => ((t || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || []).map(s => s.trim()).filter(Boolean);
const sentenceSpans = text => splitSentences(text).map(s => el('span', { class: 'sent' }, s + ' '));
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const fmtDate = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return d; } };

/* ---------- page ---------- */
function render(day) {
  const accent = day.game?.accent || '#ff8a3d';
  document.documentElement.style.setProperty('--accent', accent);
  $('meta[name=theme-color]')?.setAttribute('content', '#0b0d10');
  document.title = `${day.year ? day.year + ' ' : ''}${day.name} — Daytrip`;

  const hookS = sentenceSpans(day.hook);
  const storyS = sentenceSpans(day.story);
  const descS = sentenceSpans(day.description);

  const speakBtn = el('button', { class: 'btn speak', type: 'button', 'aria-pressed': 'false' }, '▶ Listen');
  const speaker = new Speaker([...hookS, ...storyS, ...descS], speakBtn);
  speakBtn.addEventListener('click', () => speaker.toggle());
  if (!('speechSynthesis' in window)) { speakBtn.disabled = true; speakBtn.textContent = 'Listen (not supported here)'; }

  const app = $('#app');
  app.replaceChildren(
    el('section', { class: 'card hero' },
      el('div', { class: 'meta' }, el('span', { class: 'badge' }, CLASS_LABEL[day.class] || day.class || 'Car'), el('span', {}, fmtDate(day.date))),
      el('h1', {}, day.year ? el('span', { class: 'year' }, day.year) : null, day.year ? ' ' : null, day.name),
      el('p', { class: 'maker' }, [day.maker, day.country].filter(Boolean).join(' · ')),
      day.hook ? el('p', { class: 'hook' }, hookS) : null,
      speakBtn),
    el('div', { class: 'photo-slot' }),
    day.story ? el('section', { class: 'card' }, el('h2', {}, 'The story'), el('p', { class: 'story' }, storyS)) : null,
    day.description ? el('section', { class: 'card' }, el('h2', {}, 'What it is'), el('p', {}, descS)) : null,
    day.stats?.length ? el('section', { class: 'card' }, el('h2', {}, 'Numbers'), statsGrid(day.stats)) : null,
    el('section', { class: 'card game-card' },
      el('h2', {}, 'Take it for a drive'),
      el('p', { class: 'hint' }, 'Tap left or right to change lanes. Swipe works too. One hit ends the run.'),
      el('div', { id: 'game' })),
    day.sources?.length ? el('footer', { class: 'sources' }, 'Sources: ',
      day.sources.map((s, i) => [i ? ' · ' : null, el('a', { href: s, target: '_blank', rel: 'noopener' }, hostOf(s))])) : null,
  );
  new Game($('#game'), day);

  // Photos: hand-picked `photos` win; otherwise a `photoQuery` is resolved against Wikimedia Commons in the browser.
  const slot = $('.photo-slot');
  if (day.photos?.length) slot.replaceWith(photoStrip(day.photos));
  else if (day.photoQuery) fetchCommonsPhotos(day.photoQuery, 3, day.date).then(ps => ps.length ? slot.replaceWith(photoStrip(ps)) : slot.remove()).catch(() => slot.remove());
  else slot.remove();
}

/* ---------- photos from Wikimedia Commons (client-side; mirrors scripts/commons.mjs) ---------- */
const OK_LICENSE = /^(cc0|public domain|pd[- ]|cc[- ]by(?:[- ]sa)?(?: \d(\.\d)?)?$)/i;
const BAD_LICENSE = /(nc|nd|non-commercial|no derivatives|fair use|copyright)/i;
const BAD_TITLE = /logo|badge|emblem|brochure|advert|scan|drawing|diagram|model car|toy|scale model|lego/i;
const stripHtml = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
async function fetchCommonsPhotos(query, want = 3, cacheKey = '') {
  const key = cacheKey ? `daytrip.photos.${cacheKey}` : '';
  try { const c = key && JSON.parse(localStorage.getItem(key) || 'null'); if (c && Date.now() - c.t < 864e5 && Array.isArray(c.p) && c.p.length) return c.p; } catch {}
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.search = new URLSearchParams({ action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '40', prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '800' });
  const res = await fetch(api); if (!res.ok) throw new Error(`Commons ${res.status}`);
  const pages = Object.values((await res.json())?.query?.pages || {});
  const tokens = query.split(/\s+/).filter(t => t.length > 2 && !/^(19|20)\d\d$/.test(t));
  const picks = pages.map(p => {
    const ii = p.imageinfo?.[0]; if (!ii) return null; const md = ii.extmetadata || {};
    const license = stripHtml(md.LicenseShortName?.value), credit = stripHtml(md.Artist?.value) || stripHtml(md.Credit?.value) || 'Unknown';
    if (!/^image\/(jpeg|png)$/.test(ii.mime || '') || !OK_LICENSE.test(license) || BAD_LICENSE.test(license) || (ii.width || 0) < 900) return null;
    const title = stripHtml(p.title).replace(/^File:/, ''); if (BAD_TITLE.test(title)) return null;
    const hits = tokens.filter(t => title.toLowerCase().includes(t.toLowerCase())).length; if (tokens.length && !hits) return null;
    const score = hits * 1.5 + (ii.width >= ii.height ? 2 : 0) + Math.min(2, ii.width / 2000);
    const url = ii.thumburl || ii.url; // use the API-issued URL verbatim; hand-edited sizes return 400
    return { score, key: title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24), photo: { url, thumb: url, credit: credit.slice(0, 80), license, source: ii.descriptionurl, alt: title.replace(/\.(jpe?g|png)$/i, '').replace(/_/g, ' ') } };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
  const seen = new Set(), out = [];
  for (const p of picks) { if (seen.has(p.key)) continue; seen.add(p.key); out.push(p.photo); if (out.length >= want) break; }
  try { if (key) localStorage.setItem(key, JSON.stringify({ t: Date.now(), p: out })); } catch {}
  return out;
}

function photoStrip(photos) {
  return el('div', { class: 'photos' }, photos.map(p => el('figure', {},
    el('img', { src: p.thumb || p.url, alt: p.alt || '', loading: 'lazy', decoding: 'async', onerror: e => e.target.closest('figure').remove() }),
    el('figcaption', {}, [p.credit, p.license].filter(Boolean).join(' · '), p.source ? [' · ', el('a', { href: p.source, target: '_blank', rel: 'noopener' }, 'source')] : null),
  )));
}

function statsGrid(stats) {
  return el('div', { class: 'stats' }, stats.map(s => el('div', { class: 'stat' }, el('b', {}, s.value), el('span', {}, s.label))));
}

function showError(msg) {
  $('#app').replaceChildren(el('section', { class: 'card' }, el('h2', {}, 'Could not load today'), el('p', { class: 'error' }, msg), el('p', { class: 'maker' }, 'Try the ', el('a', { href: 'archive.html' }, 'garage'), ' instead.')));
}

/* ---------- read aloud ---------- */
class Speaker {
  constructor(spans, btn) {
    this.spans = spans; this.btn = btn; this.i = 0; this.playing = false; this.voice = null;
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find(v => /^en[-_]US/i.test(v.lang) && /Samantha|Ava|Google US|Natural|Aria|Jenny|Premium|Enhanced/i.test(v.name))
        || vs.find(v => /^en[-_]US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
    };
    pick(); speechSynthesis.addEventListener('voiceschanged', pick);
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.playing) this.stop(); });
  }
  toggle() { this.playing ? this.stop() : this.start(); }
  start() {
    if (!this.spans.length) return;
    if (this.i >= this.spans.length) this.i = 0;
    this.playing = true; this.btn.textContent = '■ Stop'; this.btn.setAttribute('aria-pressed', 'true');
    speechSynthesis.cancel(); this.next();
  }
  stop() {
    this.playing = false; speechSynthesis.cancel(); this.clearHl();
    this.btn.textContent = this.i > 0 && this.i < this.spans.length ? '▶ Resume' : '▶ Listen';
    this.btn.setAttribute('aria-pressed', 'false');
  }
  clearHl() { this.spans.forEach(s => s.classList.remove('hl')); }
  next() {
    if (!this.playing) return;
    if (this.i >= this.spans.length) { this.i = 0; this.stop(); return; }
    const span = this.spans[this.i]; this.clearHl(); span.classList.add('hl');
    if (this.i > 0) span.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    const u = new SpeechSynthesisUtterance(span.textContent.trim());
    if (this.voice) u.voice = this.voice;
    u.rate = 1; u.pitch = 1;
    u.onend = () => { if (this.playing) { this.i++; this.next(); } };
    u.onerror = e => { if (this.playing && e.error !== 'interrupted' && e.error !== 'canceled') { this.i++; this.next(); } };
    speechSynthesis.speak(u);
  }
}

/* ---------- pixel art ---------- */
const DEFAULT_SPRITE = {
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
function buildSprite(sp, accent) {
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
function buildObstacle(type) {
  const c = document.createElement('canvas'); c.width = 12; c.height = 12;
  (OBSTACLES[type] || OBSTACLES.cone)(c.getContext('2d')); return c;
}

/* ---------- scenery (top-down side strips, two parallax layers) ---------- */
const SCENERY = {
  forest:   { ground: '#1f3d22', far: '#254a29', items: (g, x, y, k) => { const s = 5 + (k % 3); px(g, x - s, y - s, s * 2, s * 2, '#2f6b35'); px(g, x - s + 1, y - s + 1, s, s, '#3d8a45'); } },
  city:     { ground: '#2a2d33', far: '#33373e', items: (g, x, y, k) => { const w = 8 + (k % 3) * 2, h = 10 + (k % 4) * 3; px(g, x - w / 2, y - h / 2, w, h, '#4a4f58'); for (let i = 1; i < h - 1; i += 3) for (let j = 1; j < w - 1; j += 3) px(g, x - w / 2 + j, y - h / 2 + i, 1, 1, (k + i + j) % 3 ? '#ffd76b' : '#2a2d33'); } },
  mountain: { ground: '#4b3d32', far: '#5a4a3d', items: (g, x, y, k) => { const s = 6 + (k % 4); px(g, x - s, y - 2, s * 2, 4, '#6f5d4c'); px(g, x - s + 2, y - 5, s * 2 - 4, 4, '#857160'); px(g, x - 2, y - 7, 4, 3, '#a89482'); } },
  desert:   { ground: '#c9a25c', far: '#d4b06c', items: (g, x, y, k) => { px(g, x - 1, y - 6, 3, 12, '#3f7a3b'); if (k % 2) px(g, x - 4, y - 3, 3, 2, '#3f7a3b'), px(g, x - 4, y - 6, 2, 4, '#3f7a3b'); else px(g, x + 2, y - 2, 3, 2, '#3f7a3b'), px(g, x + 3, y - 5, 2, 4, '#3f7a3b'); } },
  coast:    { ground: '#e3cf9a', far: '#1e6fb5', items: (g, x, y, k) => { if (x < 80) { px(g, x - 5, y, 8, 1, '#8fd0ff'); px(g, x - 2, y + 3, 6, 1, '#8fd0ff'); } else { px(g, x - 1, y - 6, 2, 10, '#8a5a2b'); px(g, x - 5, y - 8, 10, 3, '#2f8f3e'); px(g, x - 3, y - 10, 6, 2, '#2f8f3e'); } } },
  track:    { ground: '#6b6f76', far: '#7d828a', items: (g, x, y, k) => { if (k % 3 === 0) { px(g, x - 7, y - 6, 14, 12, '#3a3d44'); for (let i = 0; i < 4; i++) px(g, x - 6, y - 5 + i * 3, 12, 1, (k + i) % 2 ? '#e33' : '#fff'); } else { px(g, x - 4, y - 4, 8, 8, '#5b5f66'); px(g, x - 3, y - 3, 6, 6, '#8a8f97'); } } },
  snow:     { ground: '#e6eef6', far: '#f2f6fa', items: (g, x, y, k) => { const s = 4 + (k % 3); px(g, x - s, y + 2, s * 2, 3, '#1f3a2a'); px(g, x - s + 1, y - 1, s * 2 - 2, 3, '#25482f'); px(g, x - s + 2, y - 4, s * 2 - 4, 3, '#2f5c3a'); px(g, x - 1, y - 6, 2, 2, '#2f5c3a'); px(g, x - s + 1, y - 1, s * 2 - 2, 1, '#fff'); } },
};
const hash = n => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return x / 4294967296; };

/* ---------- audio ---------- */
class Sound {
  constructor() {
    this.ctx = null; this.muted = localStorage.getItem('daytrip.mute') === '1';
    // never make noise from a background tab
    document.addEventListener('visibilitychange', () => { if (this.ctx && document.hidden) this.ctx.suspend(); });
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.osc = this.ctx.createOscillator(); this.osc.type = 'sawtooth';
    this.osc2 = this.ctx.createOscillator(); this.osc2.type = 'square';
    this.filter = this.ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 500;
    this.gain = this.ctx.createGain(); this.gain.gain.value = 0;
    this.osc.connect(this.filter); this.osc2.connect(this.filter); this.filter.connect(this.gain).connect(this.ctx.destination);
    this.osc.start(); this.osc2.start();
  }
  engine(ratio, on) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.osc.frequency.setTargetAtTime(38 + ratio * 150, t, 0.06);
    this.osc2.frequency.setTargetAtTime(19 + ratio * 75, t, 0.06);
    this.gain.gain.setTargetAtTime(on && !this.muted ? 0.035 : 0, t, 0.08);
  }
  hit() {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    const len = 0.25, buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(g).connect(this.ctx.destination); src.start();
  }
  toggle() { this.muted = !this.muted; localStorage.setItem('daytrip.mute', this.muted ? '1' : '0'); if (this.ctx) this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02); return this.muted; }
}

/* ---------- game ---------- */
const W = 160, H = 240, ROAD_X = 28, ROAD_W = 104, CAR_Y = 196;
// Near miss: pass an obstacle while still crossing lanes and the distance you earn is
// multiplied, up to MAX_COMBO chained misses. Sitting in the next lane already leaves
// exactly `laneW - 11` px of clear air (half the car plus half the obstacle), so the
// threshold is that minus a few pixels: you only score it by dodging as the obstacle
// arrives, or cutting back in behind it. A fixed pixel threshold does not work here —
// the lane-change lerp covers ~5 px per frame where it matters, so anything tighter
// than ~7 px is a crash and the window would be unhittable.
const NEAR_MISS_SLACK = 3, NEAR_MISS_BONUS = 0.05, MAX_COMBO = 5, COMBO_HOLD = 2.5;
// Road curvature: the whole road slides left and right on one slow sine wave so a long
// run stops feeling like a straight corridor. It is purely cosmetic. The shift depends
// on `y - scroll`, i.e. where a row sits along the road rather than on the screen, so a
// road feature keeps its own offset as it scrolls past and the car and an obstacle at
// the same y are always shifted by the same amount. Everything the player can hit stays
// in unbent lane space: collision and near misses are untouched. 13 px of swing keeps
// the 104 px road inside the 160 px frame with its edge lines intact.
const BEND_MAX = 13, BEND_WAVE = 760;
class Game {
  constructor(mount, day) {
    const gp = day.game || {};
    this.day = day;
    this.lanes = Math.min(4, Math.max(2, gp.laneCount || 3));
    this.laneW = ROAD_W / this.lanes;
    this.nearMissPx = Math.max(2, this.laneW - 11 - NEAR_MISS_SLACK);
    this.baseSpeed = 66 * (gp.baseSpeed || 1);
    this.maxSpeed = 320 * (gp.maxSpeed || 1);
    this.stars = gp.stars || [300, 800, 1500];
    this.accent = gp.accent || '#ff8a3d';
    this.scenery = SCENERY[gp.scenery] || SCENERY.track;
    this.sprite = buildSprite(day.sprite && Array.isArray(day.sprite.rows) ? day.sprite : DEFAULT_SPRITE, this.accent);
    this.obst = buildObstacle(gp.obstacle);
    this.sound = new Sound();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // `game.curve` is optional (0–1, default 0.6); a day that wants a dead-straight
    // road sets 0. Reduced motion flattens it outright — the lateral drift is the
    // whole point of the effect and the road already scrolls without it.
    this.curve = this.reduced ? 0 : BEND_MAX * Math.min(1, Math.max(0, gp.curve ?? 0.6));
    this.bends = new Int8Array(H);
    this.bestKey = `daytrip.best.${day.date || 'x'}`;
    this.best = +localStorage.getItem(this.bestKey) || 0;

    this.buf = document.createElement('canvas'); this.buf.width = W; this.buf.height = H;
    this.g = this.buf.getContext('2d');
    this.canvas = el('canvas', { 'aria-label': 'Driving game' });
    this.distEl = el('span', {}, '0 m'); this.multEl = el('span', { class: 'mult' }, '');
    this.starEl = el('span', { class: 'stars' }, '☆☆☆'); this.spdEl = el('span', { class: 'spd' }, '0 km/h');
    this.hud = el('div', { class: 'hud' }, el('span', { class: 'dist' }, this.distEl, this.multEl), this.starEl, this.spdEl);
    this.overlay = el('div', { class: 'overlay' });
    this.wrap = el('div', { class: 'game-wrap' }, this.canvas, this.hud, this.overlay);
    this.muteBtn = el('button', { type: 'button' }, this.sound.muted ? '🔇 Sound off' : '🔊 Sound on');
    this.bestEl = el('span', {}, `Best today: ${this.best} m`);
    mount.replaceChildren(this.wrap, el('div', { class: 'game-tools' }, this.bestEl, this.muteBtn));
    this.muteBtn.addEventListener('click', () => { this.muteBtn.textContent = this.sound.toggle() ? '🔇 Sound off' : '🔊 Sound on'; });

    this.dctx = this.canvas.getContext('2d');
    new ResizeObserver(() => this.fit()).observe(this.wrap); this.fit();
    this.bindInput();
    this.reset(); this.showIdle();
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'running') this.pause(); });
  }
  fit() {
    const dpr = Math.min(3, window.devicePixelRatio || 1), cw = this.wrap.clientWidth || 320;
    const scale = Math.max(1, Math.floor(cw * dpr / W));
    this.canvas.width = W * scale; this.canvas.height = H * scale;
    this.dctx.imageSmoothingEnabled = false;
  }
  reset() {
    this.state = 'idle'; this.lane = Math.floor(this.lanes / 2); this.carX = this.laneCenter(this.lane);
    this.speed = this.baseSpeed; this.dist = 0; this.scroll = 0; this.obs = []; this.nextSpawn = this.baseSpeed * 1.4; this.lastFree = this.lane;
    this.shake = 0; this.tick = 0;
    this.clearCombo(); this.sparks = [];
  }
  clearCombo() { this.combo = 0; this.comboT = 0; this._c = 0; if (this.multEl) this.multEl.textContent = ''; }
  nearMiss() {
    this.combo = Math.min(MAX_COMBO, this.combo + 1); this.comboT = COMBO_HOLD;
    if (this.reduced) return;
    for (let i = 0; i < 5; i++)
      this.sparks.push({ x: this.carX + (Math.random() - 0.5) * 14, y: CAR_Y + 4 + Math.random() * 16, vx: (Math.random() - 0.5) * 50, vy: 40 + Math.random() * 60, t: 0.28 });
  }
  laneCenter(i) { return ROAD_X + this.laneW * (i + 0.5); }
  // Draw-time only. Never call these from update(): the lanes themselves do not move.
  bend(y) { return this.curve ? this.curve * Math.sin((y - this.scroll) * (Math.PI * 2 / BEND_WAVE)) : 0; }
  bendPx(y) { return Math.round(this.bend(y)); }
  showIdle() {
    this.overlay.hidden = false;
    this.overlay.replaceChildren(el('div', { class: 'big' }, 'Ready?'), el('div', { class: 'sub' }, `${this.day.year || ''} ${this.day.name || ''}`.trim()), el('div', { class: 'cta' }, 'Tap to drive'));
  }
  showCrash() {
    const m = Math.floor(this.dist), s = this.starsFor(m);
    this.overlay.hidden = false;
    this.overlay.replaceChildren(
      el('div', { class: 'stars' }, '★'.repeat(s) + '☆'.repeat(3 - s)),
      el('div', { class: 'big' }, `${m} m`),
      el('div', { class: 'sub' }, m >= this.best && m > 0 ? 'New best today' : `Best today: ${this.best} m`),
      el('div', { class: 'sub' }, s < 3 ? `${this.stars[s]} m for ${['one star', 'two stars', 'three stars'][s]}` : 'Full marks'),
      el('div', { class: 'cta' }, 'Tap to go again'));
  }
  showPaused() { this.overlay.hidden = false; this.overlay.replaceChildren(el('div', { class: 'big' }, 'Paused'), el('div', { class: 'cta' }, 'Tap to resume')); }
  starsFor(m) { return this.stars.filter(t => m >= t).length; }
  start() { this.reset(); this.state = 'running'; this.overlay.hidden = true; this.sound.unlock(); }
  pause() { this.state = 'paused'; this.sound.engine(0, false); this.sound.ctx?.suspend(); this.showPaused(); }
  resume() { this.state = 'running'; this.overlay.hidden = true; this.sound.unlock(); }
  crash() {
    this.state = 'crashed'; this.shake = this.reduced ? 0 : 0.35;
    this.sparks.length = 0; this.clearCombo();
    this.sound.engine(0, false); this.sound.hit();
    try { navigator.vibrate?.(90); } catch {}
    const m = Math.floor(this.dist);
    if (m > this.best) { this.best = m; localStorage.setItem(this.bestKey, String(m)); this.bestEl.textContent = `Best today: ${m} m`; }
    this.showCrash();
  }
  move(dir) { if (this.state !== 'running') return; this.lane = Math.max(0, Math.min(this.lanes - 1, this.lane + dir)); }
  tapOrStart() {
    if (this.state === 'idle' || this.state === 'crashed') { this.start(); return true; }
    if (this.state === 'paused') { this.resume(); return true; }
    return false;
  }
  bindInput() {
    let gesture = null;
    this.wrap.addEventListener('pointerdown', e => {
      e.preventDefault(); this.sound.unlock();
      if (this.state === 'crashed' && performance.now() - this.crashAt < 500) return;
      if (this.tapOrStart()) return;
      const r = this.wrap.getBoundingClientRect(), dir = e.clientX < r.left + r.width / 2 ? -1 : 1;
      this.move(dir); gesture = { x: e.clientX, tapDir: dir, swiped: false };
      this.wrap.setPointerCapture?.(e.pointerId);
    });
    this.wrap.addEventListener('pointermove', e => {
      if (!gesture || gesture.swiped) return;
      const dx = e.clientX - gesture.x; if (Math.abs(dx) < 28) return;
      gesture.swiped = true; const dir = Math.sign(dx);
      if (dir !== gesture.tapDir) this.move(2 * dir);
    });
    const end = () => { gesture = null; };
    this.wrap.addEventListener('pointerup', end); this.wrap.addEventListener('pointercancel', end);
    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'a') { this.move(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'd') { this.move(1); e.preventDefault(); }
      else if (e.key === ' ' || e.key === 'Enter') { if (this.tapOrStart()) e.preventDefault(); }
      else if (e.key === 'p' && this.state === 'running') this.pause();
    });
  }
  spawn() {
    const multi = this.dist > 200 && this.lanes > 2 && Math.random() < 0.3;
    let lanes = [];
    if (multi) {
      const lo = Math.max(0, this.lastFree - 1), hi = Math.min(this.lanes - 1, this.lastFree + 1);
      const free = lo + Math.floor(Math.random() * (hi - lo + 1));
      for (let i = 0; i < this.lanes; i++) if (i !== free) lanes.push(i);
      this.lastFree = free;
    } else {
      const l = Math.floor(Math.random() * this.lanes); lanes = [l];
      this.lastFree = l === this.lastFree ? (l + 1) % this.lanes : this.lastFree;
    }
    for (const l of lanes) this.obs.push({ lane: l, y: -14 });
    // Space rows by time, not pixels: a fixed pixel gap collapses into
    // unreactable walls once the speed ramp bites. 1.15 s early, 0.6 s by ~1,400 m.
    const gapTime = Math.max(0.6, 1.15 - this.dist / 2600);
    this.nextSpawn = this.speed * gapTime * (multi ? 1.55 : 1) * (0.85 + Math.random() * 0.4);
  }
  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t; this.tick += dt;
    if (this.state === 'running') this.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    this.draw();
    requestAnimationFrame(tt => this.frame(tt));
  }
  update(dt) {
    if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.clearCombo();
    // Ramp tuned so a default day (baseSpeed 1, stars 300/800/1500) reaches
    // one star at ~45 s, two at ~91 s, three at ~2:12.
    this.speed = Math.min(this.maxSpeed, this.baseSpeed + this.dist * 0.13);
    const dy = this.speed * dt; this.scroll += dy; this.dist += dy * 0.08 * (1 + this.combo * NEAR_MISS_BONUS);
    this.nextSpawn -= dy; if (this.nextSpawn <= 0) this.spawn();
    const target = this.laneCenter(this.lane); this.carX += (target - this.carX) * Math.min(1, dt * 18);
    for (const o of this.obs) o.y += dy;
    this.obs = this.obs.filter(o => o.y < H + 16);
    const cx = this.carX - 6, cy = CAR_Y + 2, cw = 12, ch = 20;
    for (const o of this.obs) {
      const ox = this.laneCenter(o.lane) - 5, oy = o.y + 1, ow = 10, oh = 10;
      if (cx < ox + ow && cx + cw > ox && cy < oy + oh && cy + ch > oy) { this.crashAt = performance.now(); this.crash(); return; }
      // While the obstacle is alongside the car, remember the tightest clear air between
      // them; once it is fully past, a small enough gap counts as a near miss. Horizontal
      // overlap while alongside is a crash, caught above, so the gap is never negative.
      if (oy + oh > cy && oy < cy + ch) o.gap = Math.min(o.gap ?? Infinity, Math.max(cx - (ox + ow), ox - (cx + cw)));
      else if (oy >= cy + ch && !o.passed && o.gap != null) { o.passed = true; if (o.gap <= this.nearMissPx) this.nearMiss(); }
    }
    for (const s of this.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.t -= dt; }
    if (this.sparks.length) this.sparks = this.sparks.filter(s => s.t > 0);
    this.sound.engine((this.speed - this.baseSpeed) / (this.maxSpeed - this.baseSpeed), true);
    const m = Math.floor(this.dist), kmh = Math.round(this.speed * 0.9);
    if (m !== this._m) { this._m = m; this.distEl.textContent = `${m} m`; this.starEl.textContent = '★'.repeat(this.starsFor(m)) + '☆'.repeat(3 - this.starsFor(m)); }
    if (kmh !== this._k) { this._k = kmh; this.spdEl.textContent = `${kmh} km/h`; }
    if (this.combo !== this._c) { this._c = this.combo; this.multEl.textContent = this.combo ? ` ×${(1 + this.combo * NEAR_MISS_BONUS).toFixed(2)}` : ''; }
  }
  draw() {
    const g = this.g, sc = this.scenery, s = this.scroll, bends = this.bends;
    if (this.curve) for (let y = 0; y < H; y++) bends[y] = this.bendPx(y); // else it stays all zeros

    const at = y => bends[y < 0 ? 0 : y > H - 1 ? H - 1 : Math.round(y)];
    g.fillStyle = sc.ground; g.fillRect(0, 0, W, H);
    g.fillStyle = sc.far;
    for (let i = 0; i < 12; i++) { const y = ((i * 40 + s * 0.5) % (H + 40)) - 20, b = at(y); g.fillRect(0, y, ROAD_X - 6 + b, 6); g.fillRect(ROAD_X + ROAD_W + 6 + b, y, W, 6); }
    for (let i = 0; i < 14; i++) {
      const y = ((i * 46 + s) % (H + 60)) - 30, side = i % 2 ? 1 : -1;
      const x = side < 0 ? 4 + Math.floor(hash(i) * 14) : ROAD_X + ROAD_W + 6 + Math.floor(hash(i + 99) * 14);
      sc.items(g, x + at(y), y, i + 7);
    }
    if (this.curve) {
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
    for (let l = 1; l < this.lanes; l++) { const x = Math.round(ROAD_X + this.laneW * l) - 1; for (let i = -1; i < 12; i++) { const y = ((i * 24 + s) % (H + 24)) - 12; g.fillRect(x + at(y + 6), y, 2, 12); } }
    for (const o of this.obs) g.drawImage(this.obst, Math.round(this.laneCenter(o.lane) - 6 + this.bend(o.y + 6)), Math.round(o.y));
    for (const sp of this.sparks) { g.fillStyle = sp.t > 0.14 ? '#ffffff' : this.accent; g.fillRect(Math.round(sp.x + this.bend(sp.y)), Math.round(sp.y), 1, 1); }
    const cb = this.bend(CAR_Y + 12);
    if (this.state === 'crashed') { g.fillStyle = 'rgba(255,60,60,.35)'; g.fillRect(Math.round(this.carX - 9 + cb), CAR_Y - 3, 18, 30); }
    g.drawImage(this.sprite, Math.round(this.carX - 8 + cb), CAR_Y);
    if (this.state === 'running' && this.speed > this.baseSpeed * 1.6 && Math.floor(this.tick * 20) % 2) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(Math.round(this.carX - 4 + cb), CAR_Y + 24, 2, 5); g.fillRect(Math.round(this.carX + 2 + cb), CAR_Y + 24, 2, 5); }
    const d = this.dctx, k = this.canvas.width / W;
    const ox = this.shake ? Math.round((Math.random() - 0.5) * 6 * k) : 0, oy = this.shake ? Math.round((Math.random() - 0.5) * 6 * k) : 0;
    d.imageSmoothingEnabled = false;
    d.fillStyle = '#000'; d.fillRect(0, 0, this.canvas.width, this.canvas.height);
    d.drawImage(this.buf, ox, oy, this.canvas.width, this.canvas.height);
  }
}

/* ---------- boot ---------- */
loadDay().then(render).catch(e => { console.error(e); showError(e.message || String(e)); });
})();
