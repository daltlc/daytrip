/* Daytrip — the game: state, input, and the lane dodge itself. Everything that
   turns into pixels lives in render.js; this file owns what the player can hit.
   Nothing in here touches the page outside its own mount. */
import { el } from './dom.js';
import { W, H, ROAD_X, ROAD_W, CAR_Y } from './geom.js';
import { SCENERY, WEATHER, SCENERY_WEATHER, BEND_MAX, buildSprite, buildObstacle, newDrop, stepWeather, draw } from './render.js';

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
// Near miss: pass an obstacle while still crossing lanes and the distance you earn is
// multiplied, up to MAX_COMBO chained misses. Sitting in the next lane already leaves
// exactly `laneW - 11` px of clear air (half the car plus half the obstacle), so the
// threshold is that minus a few pixels: you only score it by dodging as the obstacle
// arrives, or cutting back in behind it. A fixed pixel threshold does not work here —
// the lane-change lerp covers ~5 px per frame where it matters, so anything tighter
// than ~7 px is a crash and the window would be unhittable.
const NEAR_MISS_SLACK = 3, NEAR_MISS_BONUS = 0.05, MAX_COMBO = 5, COMBO_HOLD = 2.5;
// Ghost of today's best run. The run records the car's x every GHOST_STEP metres of
// distance, and a run that beats the day's best stores that trace next to the best
// number. A later run then draws a faint car at the x the best run held *at the same
// metre mark*, so it is a pace ghost: level with you means you are level with your best.
// Distance, not time, is the index — the near-miss multiplier makes the two disagree,
// and the metre mark is what the score, the stars and the best are all counted in.
// Nothing here is read by update(): the ghost is drawn and never collides.
const GHOST_STEP = 2, GHOST_MAX = 1600;
export class Game {
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
    this.sprite = buildSprite(day.sprite, this.accent);   // buildSprite owns the fallback for an unusable sprite
    this.obst = buildObstacle(gp.obstacle);
    this.sound = new Sound();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // `game.curve` is optional (0–1, default 0.6); a day that wants a dead-straight
    // road sets 0. Reduced motion flattens it outright — the lateral drift is the
    // whole point of the effect and the road already scrolls without it. The bend
    // itself is drawn in render.js; this is only how far it is allowed to swing.
    this.curve = this.reduced ? 0 : BEND_MAX * Math.min(1, Math.max(0, gp.curve ?? 0.6));
    this.bends = new Int8Array(H);
    // Reduced motion drops the weather entirely: it is drifting specks and nothing else.
    const wk = !gp.weather || gp.weather === 'auto' ? SCENERY_WEATHER[gp.scenery] : gp.weather;
    this.weather = this.reduced ? null : WEATHER[wk] || null;
    this.drops = [];
    if (this.weather) for (let i = 0; i < this.weather.count; i++) this.drops.push(newDrop(this, true));
    this.bestKey = `daytrip.best.${day.date || 'x'}`;
    this.best = +localStorage.getItem(this.bestKey) || 0;
    this.ghostKey = `daytrip.ghost.${day.date || 'x'}`;
    this.ghost = this.loadGhost();

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
    // Tally for the whole run, so the crash card can report it. Deliberately not touched
    // by clearCombo(): the chain expiring, and the crash itself, both have to leave it.
    this.misses = 0; this.bestCombo = 0;
    this.clearCombo(); this.sparks = [];
    this.trace = [];
  }
  // A stored ghost is just a list of x positions. Anything else — an older key, a hand-edited
  // value, a half-written string — is dropped rather than drawn: a bad ghost must never be
  // able to break the run that is racing it.
  loadGhost() {
    try {
      const p = JSON.parse(localStorage.getItem(this.ghostKey) || 'null');
      if (Array.isArray(p) && p.length > 1 && p.every(n => Number.isFinite(n))) return p;
    } catch {}
    return null;
  }
  saveGhost(p) {
    this.ghost = p;
    try { localStorage.setItem(this.ghostKey, JSON.stringify(p)); } catch {} // quota: the run still keeps its ghost in memory
  }
  // Where the best run sat at metre `m`, interpolated between samples. null past its end,
  // which is the point where you have beaten it.
  ghostX(m) {
    const p = this.ghost; if (!p) return null;
    const f = m / GHOST_STEP, i = Math.floor(f);
    if (i < 0 || i >= p.length - 1) return null;
    return p[i] + (p[i + 1] - p[i]) * (f - i);
  }
  clearCombo() { this.combo = 0; this.comboT = 0; this._c = 0; if (this.multEl) this.multEl.textContent = ''; }
  nearMiss() {
    this.combo = Math.min(MAX_COMBO, this.combo + 1); this.comboT = COMBO_HOLD;
    this.misses++; if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    if (this.reduced) return;
    for (let i = 0; i < 5; i++)
      this.sparks.push({ x: this.carX + (Math.random() - 0.5) * 14, y: CAR_Y + 4 + Math.random() * 16, vx: (Math.random() - 0.5) * 50, vy: 40 + Math.random() * 60, t: 0.28 });
  }
  laneCenter(i) { return ROAD_X + this.laneW * (i + 0.5); }
  showIdle() {
    this.overlay.hidden = false;
    // The ghost line only appears once there is a ghost to explain, so a first run is not
    // told about a faint car it will not see.
    const rows = [el('div', { class: 'big' }, 'Ready?'), el('div', { class: 'sub' }, `${this.day.year || ''} ${this.day.name || ''}`.trim())];
    if (this.ghost) rows.push(el('div', { class: 'sub' }, 'The faint car is your best run'));
    rows.push(el('div', { class: 'cta' }, 'Tap to drive'));
    this.overlay.replaceChildren(...rows);
  }
  showCrash() {
    const m = Math.floor(this.dist), s = this.starsFor(m);
    this.overlay.hidden = false;
    // The near-miss line is otherwise only visible mid-run, in a HUD nobody is reading while
    // dodging. A clean run says nothing at all: "0 near misses" reads like a telling-off.
    const rows = [
      el('div', { class: 'stars' }, '★'.repeat(s) + '☆'.repeat(3 - s)),
      el('div', { class: 'big' }, `${m} m`),
      el('div', { class: 'sub' }, m >= this.best && m > 0 ? 'New best today' : `Best today: ${this.best} m`),
      el('div', { class: 'sub' }, s < 3 ? `${this.stars[s]} m for ${['one star', 'two stars', 'three stars'][s]}` : 'Full marks'),
    ];
    if (this.misses) rows.push(el('div', { class: 'sub' }, `${this.misses} near miss${this.misses > 1 ? 'es' : ''} · best chain ×${(1 + this.bestCombo * NEAR_MISS_BONUS).toFixed(2)}`));
    rows.push(el('div', { class: 'cta' }, 'Tap to go again'));
    this.overlay.replaceChildren(...rows);
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
    if (m > this.best) {
      this.best = m; localStorage.setItem(this.bestKey, String(m)); this.bestEl.textContent = `Best today: ${m} m`;
      // The ghost and the best come from the same run, so they only ever change together.
      if (this.trace.length > 1) this.saveGhost(this.trace.slice());
    }
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
    stepWeather(this, dt);
    draw(this);
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
    // One sample per GHOST_STEP metres. A fast frame can cross more than one step, so the
    // gap is filled with the position we are at now rather than left as a hole.
    while (this.trace.length <= this.dist / GHOST_STEP && this.trace.length < GHOST_MAX) this.trace.push(Math.round(this.carX));
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
}
