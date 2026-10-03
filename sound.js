// @ts-check
/* Daytrip — the game's audio: a WebAudio engine hum, an upshift blip and a crash burst.
   Moved out of game.js on 2026-10-02 so the simulation stays under ~600 lines. Nothing here
   reads game state; Game calls in with a 0–1 rev figure and a running flag. */
import { getItem, setItem } from './storage.js';

const ENGINE_GAIN = 0.035, HIT_LEN = 0.25, HIT_GAIN = 0.25, SHIFT_GAIN = 0.045, SHIFT_LEN = 0.11;
const SHIFT_DROP = 0.45, SHIFT_DROP_MIN = 0.1, SHIFT_DROP_MAX = 0.8;
const MUTE_KEY = 'daytrip.mute';

/** @returns {typeof AudioContext | undefined} */
function audioContextCtor() {
  const w = /** @type {{ AudioContext?: typeof AudioContext, webkitAudioContext?: typeof AudioContext }} */ (/** @type {unknown} */ (window));
  return w.AudioContext ?? w.webkitAudioContext;
}

export class Sound {
  /** @type {AudioContext | null} */ #ctx = null;
  /** @type {OscillatorNode | null} */ #osc = null;
  /** @type {OscillatorNode | null} */ #osc2 = null;
  /** @type {GainNode | null} */ #gain = null;
  muted = getItem(MUTE_KEY) === '1';

  constructor() {
    // never make noise from a background tab
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.suspend(); });
  }

  /** Create the audio graph on the first user gesture, or resume it after a suspend. */
  unlock() {
    if (this.#ctx) { if (this.#ctx.state === 'suspended') void this.#ctx.resume(); return; }
    const Ctor = audioContextCtor();
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const osc2 = ctx.createOscillator(); osc2.type = 'square';
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 500;
    const gain = ctx.createGain(); gain.gain.value = 0;
    osc.connect(filter); osc2.connect(filter); filter.connect(gain).connect(ctx.destination);
    osc.start(); osc2.start();
    this.#ctx = ctx; this.#osc = osc; this.#osc2 = osc2; this.#gain = gain;
  }

  suspend() { if (this.#ctx?.state === 'running') void this.#ctx.suspend(); }

  /**
   * @param {number} ratio 0–1 of the speed range
   * @param {boolean} on
   */
  engine(ratio, on) {
    if (!this.#ctx || !this.#osc || !this.#osc2 || !this.#gain) return;
    const t = this.#ctx.currentTime;
    this.#osc.frequency.setTargetAtTime(38 + ratio * 150, t, 0.06);
    this.#osc2.frequency.setTargetAtTime(19 + ratio * 75, t, 0.06);
    this.#gain.gain.setTargetAtTime(on && !this.muted ? ENGINE_GAIN : 0, t, 0.08);
  }

  /**
   * One upshift blip on its own oscillator, since engine() re-aims the shared nodes every frame.
   * @param {number} ratio 0–1 of the speed range
   * @param {number} [drop] share of its pitch the note falls by (default 0.45; fewer gears fall further)
   */
  shift(ratio, drop = SHIFT_DROP) {
    if (!this.#ctx || this.muted) return;
    const ctx = this.#ctx, t = ctx.currentTime;
    const r = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
    const f = 150 + r * 250;
    const osc = ctx.createOscillator(); osc.type = 'square';
    osc.frequency.setValueAtTime(f, t);
    const d = Number.isFinite(drop) ? Math.min(SHIFT_DROP_MAX, Math.max(SHIFT_DROP_MIN, drop)) : SHIFT_DROP;
    osc.frequency.exponentialRampToValueAtTime(f * (1 - d), t + SHIFT_LEN);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(SHIFT_GAIN, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + SHIFT_LEN);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + SHIFT_LEN + 0.02);
  }

  /** A short burst of fading noise. */
  hit() {
    if (!this.#ctx || this.muted) return;
    const ctx = this.#ctx, t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * HIT_LEN), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(HIT_GAIN, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + HIT_LEN);
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  /** @returns {boolean} the new muted state */
  toggle() {
    this.muted = !this.muted;
    setItem(MUTE_KEY, this.muted ? '1' : '0');
    if (this.#ctx && this.#gain) this.#gain.gain.setTargetAtTime(0, this.#ctx.currentTime, 0.02);
    return this.muted;
  }
}
