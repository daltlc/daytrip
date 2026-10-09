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

/**
 * The line under the heading: how many cars, and how many of them a filter is showing.
 * @param {number} shown
 * @param {number} total
 * @param {string} cls the active class, or '' for all
 * @returns {string}
 */
function countLine(shown, total, cls) {
  const cars = total === 1 ? 'car' : 'cars';
  return cls ? `${shown} of ${total} ${cars} · ${cls}, newest first.` : `${total} ${cars} so far, newest first.`;
}

/**
 * Filter chips: "all" plus every class in the list, in order of first appearance (newest first).
 * Each chip carries its count ("rally · 2"; "all" counts every day).
 * Tapping one shows only that class; the choice rides in `?class=` so a filtered garage can be linked.
 * @param {IndexEntry[]} days
 * @param {HTMLElement} list
 * @param {HTMLElement | null} count the line under the heading, kept in step with the filter
 * @returns {HTMLElement}
 */
function filters(days, list, count) {
  /** @type {string[]} */
  const classes = [...new Set(days.map(d => d.class).filter(Boolean))];
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const d of days) if (d.class) counts.set(d.class, (counts.get(d.class) ?? 0) + 1);
  const asked = new URLSearchParams(location.search).get('class');
  let current = asked && classes.includes(asked) ? asked : '';
  const bar = el('div', { class: 'g-filters', role: 'group', 'aria-label': 'Filter by class' });
  /** @type {HTMLButtonElement[]} */
  const chips = [];
  const show = () => {
    const shown = current ? days.filter(d => d.class === current) : days;
    list.replaceChildren(...shown.map(row));
    if (count) count.textContent = countLine(shown.length, days.length, current);
    for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.value === current));
  };
  for (const cls of ['', ...classes]) {
    const chip = el('button', {
      type: 'button', class: 'g-chip', value: cls,
      onclick: () => {
        current = current === cls ? '' : cls;
        const url = new URL(location.href);
        if (current) url.searchParams.set('class', current); else url.searchParams.delete('class');
        history.replaceState(null, '', url);
        show();
      },
    }, `${cls || 'all'} · ${cls ? counts.get(cls) ?? 0 : days.length}`);
    chips.push(chip);
  }
  bar.replaceChildren(...chips);
  show();
  return bar;
}

async function main() {
  const list = must('#list');
  // Optional: an older archive.html without the line still gets its list.
  const count = document.querySelector('#count');
  const counter = count instanceof HTMLElement ? count : null;
  try {
    const res = await fetch(`days/index.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    /** @type {IndexEntry[]} */
    const days = await res.json();
    if (!days.length) { list.replaceChildren(el('li', { class: 'muted' }, 'Nothing here yet.')); return; }
    // A class with one car still gets a chip; the bar only stays hidden for a single-class garage.
    if (new Set(days.map(d => d.class)).size > 1) list.before(filters(days, list, counter));
    else {
      list.replaceChildren(...days.map(row));
      if (counter) counter.textContent = countLine(days.length, days.length, '');
    }
  } catch {
    list.replaceChildren(el('li', { class: 'muted' }, 'Could not load the garage list.'));
  }
}

void main();
