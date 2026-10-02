// @ts-check
/* Daytrip — the game: state, input, and the lane dodge itself. Everything that turns into
   pixels lives in render.js; this file owns what the player can hit. Nothing in here touches
   the page outside its own mount. */
/** @import { DayFile, Obstacle, Spark, Drop, Scenery, Weather } from './types.js' */
import { ctx2d, el, present } from './dom.js';
import { W, H, ROAD_X, ROAD_W, CAR_Y } from './geom.js';
import { BEND_MAX, SCENERY, SCENERY_WEATHER, WEATHER, buildObstacle, buildSprite, draw, newDrop, stepWeather } from './render.js';
import { Sound } from './sound.js';
import { getItem, getJson, setItem, setJson } from './storage.js';

/** @typedef {'idle' | 'running' | 'paused' | 'crashed'} GameState */
/** @typedef {{ x: number, tapDir: -1 | 1, swiped: boolean }} Gesture */

const DEFAULT_ACCENT = '#ff8a3d';
/** @type {[number, number, number]} */
const DEFAULT_STARS = [300, 800, 1500];
const MIN_LANES = 2, MAX_LANES = 4, DEFAULT_LANES = 3;
// Speed ramp, tuned so a default day (baseSpeed 1, stars 300/800/1500) reaches one star at
// ~45 s, two at ~91 s, three at ~2:12. Speeds are logical px/s; distance is in metres.
const BASE_SPEED = 66, MAX_SPEED = 320, SPEED_RAMP = 0.13, M_PER_PX = 0.08, KMH_PER_PX = 0.9;
const FIRST_GAP_S = 1.4;
// Rows are spaced by time, not pixels: a fixed pixel gap collapses into unreactable walls once
// the ramp bites. 1.15 s early, 0.6 s by ~1,400 m. Multi-obstacle rows get extra room.
const GAP_MAX_S = 1.15, GAP_MIN_S = 0.6, GAP_FALLOFF_M = 2600, MULTI_GAP = 1.55, GAP_JITTER = 0.4;
const MULTI_FROM_M = 200, MULTI_CHANCE = 0.3;
// Hit boxes, in logical px. The car is drawn 16 wide; the box is a little tighter than the art.
const CAR_HALF_W = 6, CAR_W = 12, CAR_H = 20, CAR_TOP = CAR_Y + 2;
const OBST_HALF_W = 5, OBST_W = 10, OBST_H = 10, OBST_SPAWN_Y = -14, OBST_GONE_Y = H + 16;
// Near miss: pass an obstacle while still crossing lanes and the distance you earn is multiplied,
// up to MAX_COMBO chained misses. Sitting in the next lane leaves exactly `laneW - 11` px of clear
// air (half the car plus half the obstacle), so the threshold is that minus a few pixels: you
// only score it by dodging as the obstacle arrives, or cutting back in behind it.
const NEAR_MISS_SLACK = 3, NEAR_MISS_BONUS = 0.05, MAX_COMBO = 5, COMBO_HOLD = 2.5;
const SPARKS_PER_MISS = 5, SPARK_LIFE = 0.28;
// Pace ghost of the day's best run: the car's x is sampled every GHOST_STEP metres and replayed
// at the same metre mark, so level with the ghost means level with your best.
const GHOST_STEP = 2, GHOST_MAX = 1600;
// `game.grip` (0–1) is the rate of the lane-change lerp: 0 slides across like a rally car on
// gravel, 1 snaps like a formula car. 0.5 maps to GRIP_DEFAULT, which is what days without the
// field get, so their handling never changes.
const GRIP_MIN = 9, GRIP_MAX = 27, GRIP_DEFAULT = 18;
// Below grip 0.5 the drawn car carries a little momentum: an underdamped spring (SLIDE_OMEGA rad/s,
// SLIDE_ZETA damping) chases the car's x, and whatever it swings *past* the car in the direction of
// the last lane change is drawn as `slide`, scaled by how loose the day is and capped at SLIDE_MAX px.
// The lag on the way out is never drawn, and nothing the simulation reads uses it: the hit box stays
// on `carX`. Grip 0.5 and up, a day without the field, and reduced motion all get no slide at all.
const SLIDE_OMEGA = 18, SLIDE_ZETA = 0.3, SLIDE_MAX = 4;
// A gear-shift blip every SHIFT_STEP metres gives the engine hum landmarks. Metres, not seconds,
// so the shifts arrive closer together the faster you go, like a car climbing through its gears.
// `game.gears` (MIN_GEARS–MAX_GEARS, default DEFAULT_GEARS) divides SHIFT_SPAN into the step, so
// a close-ratio racer shifts more often than an old saloon; 5 gears is the fixed 200 m every day
// before 2026-09-30 ran, and a day without the field gets exactly that.
const SHIFT_SPAN = 1000, MIN_GEARS = 3, MAX_GEARS = 8, DEFAULT_GEARS = 5;
const DEFAULT_CURVE = 0.6;
const SHAKE_S = 0.35, CRASH_LOCKOUT_MS = 500, SWIPE_PX = 28, MAX_DT = 0.05, VIBRATE_MS = 90;
const MAX_DPR = 3, FALLBACK_WIDTH = 320;
const SOUND_ON = '🔊 Sound on', SOUND_OFF = '🔇 Sound off';
const STAR_WORDS = ['one star', 'two stars', 'three stars'];

/* ---------- game ---------- */
export class Game {
  // --- configuration (fixed for the day)
  /** @type {DayFile} */ day;
  lanes = DEFAULT_LANES;
  laneW = ROAD_W / DEFAULT_LANES;
  nearMissPx = 0;
  baseSpeed = BASE_SPEED;
  maxSpeed = MAX_SPEED;
  /** @type {[number, number, number]} */ stars = DEFAULT_STARS;
  grip = GRIP_DEFAULT;
  loose = 0;
  shiftStep = SHIFT_SPAN / DEFAULT_GEARS;
  accent = DEFAULT_ACCENT;
  /** @type {Scenery} */ scenery = SCENERY.track;
  /** @type {HTMLCanvasElement} */ sprite;
  /** @type {HTMLCanvasElement} */ obst;
  sound = new Sound();
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  curve = 0;
  bends = new Int8Array(H);
  /** @type {Weather | null} */ weather = null;
  /** @type {Drop[]} */ drops = [];
  bestKey = '';
  ghostKey = '';
  best = 0;
  /** @type {number[] | null} */ ghost = null;

  // --- run state (reset every run)
  /** @type {GameState} */ state = 'idle';
  lane = 0;
  carX = 0;
  body = 0;
  bodyV = 0;
  slideDir = 0;
  slide = 0;
  speed = BASE_SPEED;
  dist = 0;
  scroll = 0;
  /** @type {Obstacle[]} */ obs = [];
  nextSpawn = 0;
  lastFree = 0;
  shake = 0;
  tick = 0;
  misses = 0;
  bestCombo = 0;
  gear = 0;
  combo = 0;
  comboT = 0;
  /** @type {Spark[]} */ sparks = [];
  /** @type {number[]} */ trace = [];
  crashAt = 0;
  #shownM = -1;
  #shownKmh = -1;
  #shownCombo = -1;
  last = 0;

  // --- DOM
  buf = document.createElement('canvas');
  /** @type {CanvasRenderingContext2D} */ g;
  canvas = el('canvas', { 'aria-label': 'Driving game' });
  /** @type {CanvasRenderingContext2D} */ dctx;
  distEl = el('span', {}, '0 m');
  multEl = el('span', { class: 'mult' });
  starEl = el('span', { class: 'stars' }, '☆☆☆');
  spdEl = el('span', { class: 'spd' }, '0 km/h');
  overlay = el('div', { class: 'overlay' });
  /** @type {HTMLDivElement} */ wrap;
  /** @type {HTMLSpanElement} */ bestEl;

  /**
   * @param {HTMLElement} mount
   * @param {DayFile} day
   */
  constructor(mount, day) {
    const gp = day.game ?? {};
    this.day = day;
    this.lanes = Math.min(MAX_LANES, Math.max(MIN_LANES, gp.laneCount ?? DEFAULT_LANES));
    this.laneW = ROAD_W / this.lanes;
    this.nearMissPx = Math.max(2, this.laneW - (CAR_HALF_W + OBST_HALF_W) - NEAR_MISS_SLACK);
    this.baseSpeed = BASE_SPEED * (gp.baseSpeed ?? 1);
    this.maxSpeed = MAX_SPEED * (gp.maxSpeed ?? 1);
    this.stars = gp.stars ?? DEFAULT_STARS;
    this.grip = Number.isFinite(gp.grip) ? GRIP_MIN + (GRIP_MAX - GRIP_MIN) * clamp01(/** @type {number} */ (gp.grip)) : GRIP_DEFAULT;
    this.loose = this.reduced || !Number.isFinite(gp.grip) ? 0 : Math.max(0, 1 - 2 * clamp01(/** @type {number} */ (gp.grip)));
    const gears = Number.isInteger(gp.gears) ? Math.min(MAX_GEARS, Math.max(MIN_GEARS, /** @type {number} */ (gp.gears))) : DEFAULT_GEARS;
    this.shiftStep = SHIFT_SPAN / gears;
    this.accent = gp.accent ?? DEFAULT_ACCENT;
    this.scenery = (gp.scenery && SCENERY[gp.scenery]) || SCENERY.track;
    this.sprite = buildSprite(day.sprite, this.accent);
    this.obst = buildObstacle(gp.obstacle);
    // Reduced motion flattens the road and drops the weather: both are pure motion.
    this.curve = this.reduced ? 0 : BEND_MAX * clamp01(gp.curve ?? DEFAULT_CURVE);
    const weatherKind = !gp.weather || gp.weather === 'auto' ? (gp.scenery ? SCENERY_WEATHER[gp.scenery] : undefined) : gp.weather;
    this.weather = !this.reduced && weatherKind && weatherKind !== 'none' ? WEATHER[weatherKind] : null;
    if (this.weather) for (let i = 0; i < this.weather.count; i++) this.drops.push(newDrop(this.weather, true));
    const dayKey = day.date || 'x';
    this.bestKey = `daytrip.best.${dayKey}`;
    this.ghostKey = `daytrip.ghost.${dayKey}`;
    this.best = Number(getItem(this.bestKey)) || 0;
    this.ghost = this.loadGhost();

    this.buf.width = W; this.buf.height = H;
    this.g = ctx2d(this.buf);
    this.dctx = ctx2d(this.canvas);
    const hud = el('div', { class: 'hud' }, el('span', { class: 'dist' }, this.distEl, this.multEl), this.starEl, this.spdEl);
    this.wrap = el('div', { class: 'game-wrap' }, this.canvas, hud, this.overlay);
    const muteBtn = el('button', { type: 'button' }, this.sound.muted ? SOUND_OFF : SOUND_ON);
    muteBtn.addEventListener('click', () => { muteBtn.textContent = this.sound.toggle() ? SOUND_OFF : SOUND_ON; });
    this.bestEl = el('span', {}, `Best today: ${this.best} m`);
    mount.replaceChildren(this.wrap, el('div', { class: 'game-tools' }, this.bestEl, muteBtn));

    new ResizeObserver(() => this.fit()).observe(this.wrap);
    this.fit();
    this.bindInput();
    this.reset();
    this.showIdle();
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'running') this.pause(); });
  }

  /** Size the display canvas to an integer multiple of the buffer so pixels stay crisp. */
  fit() {
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const width = this.wrap.clientWidth || FALLBACK_WIDTH;
    const scale = Math.max(1, Math.floor((width * dpr) / W));
    this.canvas.width = W * scale;
    this.canvas.height = H * scale;
    this.dctx.imageSmoothingEnabled = false;
  }

  reset() {
    this.state = 'idle';
    this.lane = Math.floor(this.lanes / 2);
    this.carX = this.laneCenter(this.lane);
    this.body = this.carX; this.bodyV = 0; this.slideDir = 0; this.slide = 0;
    this.speed = this.baseSpeed;
    this.dist = 0; this.scroll = 0; this.tick = 0; this.shake = 0;
    this.obs.length = 0;
    this.nextSpawn = this.baseSpeed * FIRST_GAP_S;
    this.lastFree = this.lane;
    this.misses = 0; this.bestCombo = 0; this.gear = 0;
    this.clearCombo();
    this.sparks.length = 0;
    this.trace.length = 0;
  }

  /**
   * A stored ghost is a list of x positions; anything else is dropped rather than drawn.
   * @returns {number[] | null}
   */
  loadGhost() {
    const stored = getJson(this.ghostKey);
    return Array.isArray(stored) && stored.length > 1 && stored.every(n => Number.isFinite(n)) ? /** @type {number[]} */ (stored) : null;
  }

  /** @param {number[]} trace */
  saveGhost(trace) {
    this.ghost = trace;
    setJson(this.ghostKey, trace);
  }

  /**
   * Where the best run sat at metre `m`, interpolated; null past its end (you have beaten it).
   * @param {number} m
   * @returns {number | null}
   */
  ghostX(m) {
    const p = this.ghost;
    if (!p) return null;
    const f = m / GHOST_STEP, i = Math.floor(f);
    if (i < 0 || i >= p.length - 1) return null;
    return p[i] + (p[i + 1] - p[i]) * (f - i);
  }

  clearCombo() {
    this.combo = 0; this.comboT = 0; this.#shownCombo = 0;
    this.multEl.textContent = '';
  }

  nearMiss() {
    this.combo = Math.min(MAX_COMBO, this.combo + 1);
    this.comboT = COMBO_HOLD;
    this.misses++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    if (this.reduced) return;
    for (let i = 0; i < SPARKS_PER_MISS; i++) {
      this.sparks.push({ x: this.carX + (Math.random() - 0.5) * 14, y: CAR_Y + 4 + Math.random() * 16, vx: (Math.random() - 0.5) * 50, vy: 40 + Math.random() * 60, t: SPARK_LIFE });
    }
  }

  /** @param {number} lane */
  laneCenter(lane) { return ROAD_X + this.laneW * (lane + 0.5); }

  showIdle() {
    this.overlay.hidden = false;
    this.overlay.replaceChildren(...[
      el('div', { class: 'big' }, 'Ready?'),
      el('div', { class: 'sub' }, `${this.day.year ?? ''} ${this.day.name ?? ''}`.trim()),
      this.ghost ? el('div', { class: 'sub' }, 'The faint car is your best run') : null,
      el('div', { class: 'cta' }, 'Tap to drive'),
    ].filter(present));
  }

  showCrash() {
    const m = Math.floor(this.dist), s = this.starsFor(m);
    this.overlay.hidden = false;
    this.overlay.replaceChildren(...[
      el('div', { class: 'stars' }, '★'.repeat(s) + '☆'.repeat(3 - s)),
      el('div', { class: 'big' }, `${m} m`),
      el('div', { class: 'sub' }, m >= this.best && m > 0 ? 'New best today' : `Best today: ${this.best} m`),
      el('div', { class: 'sub' }, s < 3 ? `${this.stars[s]} m for ${STAR_WORDS[s]}` : 'Full marks'),
      this.misses ? el('div', { class: 'sub' }, `${this.misses} near miss${this.misses > 1 ? 'es' : ''} · best chain ×${(1 + this.bestCombo * NEAR_MISS_BONUS).toFixed(2)}`) : null,
      el('div', { class: 'cta' }, 'Tap to go again'),
    ].filter(present));
  }

  showPaused() {
    this.overlay.hidden = false;
    this.overlay.replaceChildren(el('div', { class: 'big' }, 'Paused'), el('div', { class: 'cta' }, 'Tap to resume'));
  }

  /** @param {number} m */
  starsFor(m) { return this.stars.filter(threshold => m >= threshold).length; }

  start() { this.reset(); this.state = 'running'; this.overlay.hidden = true; this.sound.unlock(); }
  pause() { this.state = 'paused'; this.sound.engine(0, false); this.sound.suspend(); this.showPaused(); }
  resume() { this.state = 'running'; this.overlay.hidden = true; this.sound.unlock(); }

  crash() {
    this.state = 'crashed';
    this.crashAt = performance.now();
    this.shake = this.reduced ? 0 : SHAKE_S;
    this.sparks.length = 0;
    this.clearCombo();
    this.sound.engine(0, false);
    this.sound.hit();
    if ('vibrate' in navigator) navigator.vibrate(VIBRATE_MS);
    const m = Math.floor(this.dist);
    if (m > this.best) {
      this.best = m;
      setItem(this.bestKey, String(m));
      this.bestEl.textContent = `Best today: ${m} m`;
      if (this.trace.length > 1) this.saveGhost(this.trace.slice()); // the ghost and the best come from the same run
    }
    this.showCrash();
  }

  /** @param {number} dir lanes to move, negative is left */
  move(dir) {
    if (this.state !== 'running') return;
    this.lane = Math.max(0, Math.min(this.lanes - 1, this.lane + dir));
    this.slideDir = Math.sign(dir);
  }

  /** @returns {boolean} true if the tap started or resumed a run */
  tapOrStart() {
    if (this.state === 'idle' || this.state === 'crashed') { this.start(); return true; }
    if (this.state === 'paused') { this.resume(); return true; }
    return false;
  }

  bindInput() {
    /** @type {Gesture | null} */
    let gesture = null;
    this.wrap.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.sound.unlock();
      if (this.state === 'crashed' && performance.now() - this.crashAt < CRASH_LOCKOUT_MS) return;
      if (this.tapOrStart()) return;
      const rect = this.wrap.getBoundingClientRect();
      const dir = e.clientX < rect.left + rect.width / 2 ? -1 : 1;
      this.move(dir);
      gesture = { x: e.clientX, tapDir: dir, swiped: false };
      this.wrap.setPointerCapture(e.pointerId);
    });
    this.wrap.addEventListener('pointermove', e => {
      if (!gesture || gesture.swiped) return;
      const dx = e.clientX - gesture.x;
      if (Math.abs(dx) < SWIPE_PX) return;
      gesture.swiped = true;
      const dir = Math.sign(dx);
      if (dir !== gesture.tapDir) this.move(2 * dir); // the tap already moved one lane the other way
    });
    const end = () => { gesture = null; };
    this.wrap.addEventListener('pointerup', end);
    this.wrap.addEventListener('pointercancel', end);
    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'a') { this.move(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'd') { this.move(1); e.preventDefault(); }
      else if (e.key === ' ' || e.key === 'Enter') { if (this.tapOrStart()) e.preventDefault(); }
      else if (e.key === 'p' && this.state === 'running') this.pause();
    });
  }

  /** Add the next row of obstacles, always leaving at least one open lane next to the last one. */
  spawn() {
    const multi = this.dist > MULTI_FROM_M && this.lanes > 2 && Math.random() < MULTI_CHANCE;
    if (multi) {
      const lo = Math.max(0, this.lastFree - 1), hi = Math.min(this.lanes - 1, this.lastFree + 1);
      const free = lo + Math.floor(Math.random() * (hi - lo + 1));
      for (let lane = 0; lane < this.lanes; lane++) if (lane !== free) this.obs.push(newObstacle(lane));
      this.lastFree = free;
    } else {
      const lane = Math.floor(Math.random() * this.lanes);
      this.obs.push(newObstacle(lane));
      if (lane === this.lastFree) this.lastFree = (lane + 1) % this.lanes;
    }
    const gapTime = Math.max(GAP_MIN_S, GAP_MAX_S - this.dist / GAP_FALLOFF_M);
    this.nextSpawn = this.speed * gapTime * (multi ? MULTI_GAP : 1) * (1 - GAP_JITTER / 2 + Math.random() * GAP_JITTER);
  }

  /** @param {number} t */
  frame(t) {
    const dt = Math.min(MAX_DT, (t - this.last) / 1000);
    this.last = t;
    this.tick += dt;
    if (this.state === 'running') this.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    stepWeather(this, dt);
    draw(this);
    requestAnimationFrame(next => this.frame(next));
  }

  /**
   * Swing the drawn body after the car and keep only the overshoot. Drawing only, see SLIDE_OMEGA.
   * @param {number} dt seconds
   */
  stepSlide(dt) {
    const h = Math.min(dt, MAX_DT); // the spring is stable well past MAX_DT, but not at any dt
    this.bodyV += (SLIDE_OMEGA * SLIDE_OMEGA * (this.carX - this.body) - 2 * SLIDE_ZETA * SLIDE_OMEGA * this.bodyV) * h;
    this.body += this.bodyV * h;
    const past = (this.body - this.carX) * this.slideDir * this.loose;
    this.slide = Number.isFinite(past) ? this.slideDir * Math.min(SLIDE_MAX, Math.max(0, past)) : 0;
  }

  /** @param {number} dt seconds */
  update(dt) {
    if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.clearCombo();
    this.speed = Math.min(this.maxSpeed, this.baseSpeed + this.dist * SPEED_RAMP);
    const dy = this.speed * dt;
    this.scroll += dy;
    this.dist += dy * M_PER_PX * (1 + this.combo * NEAR_MISS_BONUS);
    this.nextSpawn -= dy;
    if (this.nextSpawn <= 0) this.spawn();
    const target = this.laneCenter(this.lane);
    this.carX += (target - this.carX) * Math.min(1, dt * this.grip);
    if (this.loose > 0) this.stepSlide(dt);
    // One ghost sample per GHOST_STEP metres; a long frame fills the gap with the current x.
    while (this.trace.length <= this.dist / GHOST_STEP && this.trace.length < GHOST_MAX) this.trace.push(Math.round(this.carX));

    const cx = this.carX - CAR_HALF_W, cy = CAR_TOP;
    let kept = 0;
    for (const o of this.obs) {
      o.y += dy;
      if (o.y >= OBST_GONE_Y) continue; // dropped: compacted out below
      this.obs[kept++] = o;
      const ox = this.laneCenter(o.lane) - OBST_HALF_W, oy = o.y + 1;
      if (cx < ox + OBST_W && cx + CAR_W > ox && cy < oy + OBST_H && cy + CAR_H > oy) { this.crash(); return; }
      // While alongside, remember the tightest clear air; once fully past, a small gap is a near miss.
      if (oy + OBST_H > cy && oy < cy + CAR_H) o.gap = Math.min(o.gap, Math.max(cx - (ox + OBST_W), ox - (cx + CAR_W)));
      else if (oy >= cy + CAR_H && !o.passed && o.gap !== Infinity) { o.passed = true; if (o.gap <= this.nearMissPx) this.nearMiss(); }
    }
    this.obs.length = kept;

    let live = 0;
    for (const s of this.sparks) {
      s.t -= dt;
      if (s.t <= 0) continue;
      s.x += s.vx * dt; s.y += s.vy * dt;
      this.sparks[live++] = s;
    }
    this.sparks.length = live;

    const rev = (this.speed - this.baseSpeed) / (this.maxSpeed - this.baseSpeed);
    this.sound.engine(rev, true);
    const gear = Math.floor(this.dist / this.shiftStep);
    if (gear > this.gear) { this.gear = gear; this.sound.shift(rev); }
    this.updateHud();
  }

  /** Touch the DOM only when a displayed value changes. */
  updateHud() {
    const m = Math.floor(this.dist);
    if (m !== this.#shownM) {
      this.#shownM = m;
      const s = this.starsFor(m);
      this.distEl.textContent = `${m} m`;
      this.starEl.textContent = '★'.repeat(s) + '☆'.repeat(3 - s);
    }
    const kmh = Math.round(this.speed * KMH_PER_PX);
    if (kmh !== this.#shownKmh) { this.#shownKmh = kmh; this.spdEl.textContent = `${kmh} km/h`; }
    if (this.combo !== this.#shownCombo) {
      this.#shownCombo = this.combo;
      this.multEl.textContent = this.combo ? ` ×${(1 + this.combo * NEAR_MISS_BONUS).toFixed(2)}` : '';
    }
  }
}

/**
 * @param {number} lane
 * @returns {Obstacle}
 */
function newObstacle(lane) {
  return { lane, y: OBST_SPAWN_Y, gap: Infinity, passed: false };
}

/**
 * @param {number} n
 * @returns {number}
 */
function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}
