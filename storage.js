// @ts-check
/* Daytrip — localStorage that never throws. Private mode, a full quota, or storage
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
