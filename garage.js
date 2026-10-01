// @ts-check
/* Daytrip — the garage: every past day, newest first. */
/** @import { IndexEntry } from './types.js' */
import { el, must } from './dom.js';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * @param {IndexEntry} day
 * @returns {HTMLLIElement}
 */
function row(day) {
  const href = `index.html?d=${encodeURIComponent(day.date)}`;
  // Always present so the grid columns line up; an entry without an accent gets an empty ring.
  const swatch = el('span', { class: 'g-swatch', 'aria-hidden': 'true' });
  if (day.accent && HEX_COLOR.test(day.accent)) swatch.style.backgroundColor = day.accent;
  return el('li', {}, el('a', { href },
    el('span', { class: 'g-date' }, day.date),
    swatch,
    el('span', { class: 'g-name' }, day.year ? `${day.year} ${day.name}` : day.name),
    el('span', { class: 'badge' }, day.class)));
}

async function main() {
  const list = must('#list');
  try {
    const res = await fetch(`days/index.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    /** @type {IndexEntry[]} */
    const days = await res.json();
    list.replaceChildren(...(days.length ? days.map(row) : [el('li', { class: 'muted' }, 'Nothing here yet.')]));
  } catch {
    list.replaceChildren(el('li', { class: 'muted' }, 'Could not load the garage list.'));
  }
}

void main();
