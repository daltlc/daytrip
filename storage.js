// @ts-check
/* Daytrip — localStorage (and the surprise links' sessionStorage list) that never throws. Private mode, a full quota, or storage
   switched off all just mean "no value"; nothing on the page depends on it working. */

/**
 * @param {string} key
 * @returns {string | null}
 */
export function getItem(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

/**
 * @param {string} key
 * @param {string} value
 */
export function setItem(key, value) {
  try { localStorage.setItem(key, value); } catch { /* unavailable or full */ }
}

/**
 * @param {string} key
 * @returns {unknown} `undefined` when missing or unparsable
 */
export function getJson(key) {
  const raw = getItem(key);
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function setJson(key, value) {
  setItem(key, JSON.stringify(value));
}

/** sessionStorage key for the surprise links' recent picks (garage and day page share it), newest first. */
const RECENT_KEY = 'daytrip.surprise.recent';
/** How many recent picks the next draw leaves out (when enough other cars are shown). */
const RECENT_MAX = 3;

/**
 * The dates the surprise links (garage and day page) landed on in the last few taps this session. Storage that is off,
 * missing or hand-edited into anything but a list of strings just means "none".
 * @returns {string[]}
 */
export function recentPicks() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(d => typeof d === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** @param {string} date the car a surprise link just picked */
export function rememberPick(date) {
  try {
    const next = [date, ...recentPicks().filter(d => d !== date)].slice(0, RECENT_MAX);
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* unavailable or full: the next draw just skips less */ }
}
