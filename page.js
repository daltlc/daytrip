// @ts-check
/* Daytrip — the day page: loads the day file, renders it, reads it aloud, and mounts the game
   into it. Everything optional in the day file has a fallback here. */
/** @import { DayFile, Photo, Stat, CarClass } from './types.js' */
import { el, must, ctx2d, present } from './dom.js';
import { Game } from './game.js';
import { buildSprite } from './render.js';
import { getJson, setJson } from './storage.js';

const DEFAULT_ACCENT = '#ff8a3d';
const THEME_COLOR = '#0b0d10';
const PHOTO_COUNT = 3;
const PHOTO_CACHE_MS = 24 * 60 * 60 * 1000;
const PHOTO_MIN_WIDTH = 900;
const CARD_SCALE = 6;

/** @type {Record<CarClass, string>} */
const CLASS_LABEL = {
  road: 'Road car', exotic: 'Exotic', rally: 'Rally', f1: 'Formula 1', gt3: 'GT3',
  lemans: 'Le Mans', jdm: 'JDM', muscle: 'Muscle', offroad: 'Off-road',
  vintage: 'Vintage', touring: 'Touring car', concept: 'Concept',
};

/* ---------- load ---------- */
/** @returns {Promise<DayFile>} */
async function loadDay() {
  const requested = new URLSearchParams(location.search).get('d');
  const file = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? `days/${requested}.json` : 'days/latest.json';
  const res = await fetch(`${file}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return /** @type {Promise<DayFile>} */ (res.json());
}

/* ---------- text ---------- */
// A full stop only ends a sentence if what follows looks like a new one. Guards, in order: a
// decimal point ("3.3-litre"), a single-letter initial ("J. Bugatti"), a known abbreviation
// ("St. Moritz"), no whitespace after, or a lower-case word next. Everything else splits.
const ABBREV = /(?:^|[\s("'‘“])(?:mr|mrs|ms|dr|prof|rev|st|mt|sr|jr|vs|etc|no|fig|approx|dept|vol|co|inc|ltd|ave|rd|e\.g|i\.e|a\.m|p\.m|u\.s|u\.k)\.$/i;
const INITIAL = /(?:^|[\s("'‘“])[A-Z]\.$/;
const SENTENCE_START = /[A-Z0-9"'(‘“]/;
const TERMINATORS = '.!?';
const CLOSERS = '"\')]’”';

/** @param {string | undefined} ch */
const isDigit = ch => ch !== undefined && ch >= '0' && ch <= '9';

/**
 * @param {string | undefined} raw
 * @returns {string[]}
 */
function splitSentences(raw) {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  /** @type {string[]} */
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!TERMINATORS.includes(c)) continue;
    if (c === '.' && isDigit(text[i - 1]) && isDigit(text[i + 1])) continue;
    let j = i; // "?!" and closing quotes ride along
    while (j + 1 < text.length && TERMINATORS.includes(text[j + 1])) j++;
    while (j + 1 < text.length && CLOSERS.includes(text[j + 1])) j++;
    const rest = text.slice(j + 1);
    const next = rest.charAt(1);
    const endsSentence = rest === '' || (rest.charAt(0) === ' ' && (next === '' || SENTENCE_START.test(next)));
    const head = text.slice(start, i + 1);
    const abbreviation = c === '.' && (INITIAL.test(head) || ABBREV.test(head));
    if (endsSentence && !abbreviation) {
      out.push(text.slice(start, j + 1).trim());
      start = j + 1;
    }
    i = j;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * @param {string | undefined} text
 * @returns {HTMLSpanElement[]}
 */
const sentenceSpans = text => splitSentences(text).map(s => el('span', { class: 'sent' }, `${s} `));

/** @param {string} url */
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/** @param {string} date YYYY-MM-DD */
function fmtDate(date) {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/* ---------- page ---------- */
/** @param {DayFile} day */
function render(day) {
  const accent = day.game?.accent ?? DEFAULT_ACCENT;
  document.documentElement.style.setProperty('--accent', accent);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', THEME_COLOR);
  document.title = `${day.year ? `${day.year} ` : ''}${day.name} — Daytrip`;

  const hookSpans = sentenceSpans(day.hook);
  const storySpans = sentenceSpans(day.story);
  const descSpans = sentenceSpans(day.description);

  const speakBtn = el('button', { class: 'btn speak', type: 'button', 'aria-pressed': 'false' }, '▶ Listen');
  if (Speaker.supported) {
    const speaker = new Speaker([...hookSpans, ...storySpans, ...descSpans], speakBtn);
    speakBtn.addEventListener('click', () => speaker.toggle());
  } else {
    speakBtn.disabled = true;
    speakBtn.textContent = 'Listen (not supported here)';
  }

  const photoSlot = el('div', { class: 'photo-slot' });
  const gameMount = el('div', { id: 'game' });
  must('#app').replaceChildren(...[
    el('section', { class: 'card hero' },
      el('div', { class: 'meta' }, el('span', { class: 'badge' }, (day.class && CLASS_LABEL[day.class]) || day.class || 'Car'), el('span', {}, fmtDate(day.date))),
      el('h1', {}, day.year ? el('span', { class: 'year' }, day.year) : null, day.year ? ' ' : null, day.name),
      el('p', { class: 'maker' }, [day.maker, day.country].filter(Boolean).join(' · ')),
      hookSpans.length ? el('p', { class: 'hook' }, hookSpans) : null,
      speakBtn),
    photoSlot,
    storySpans.length ? el('section', { class: 'card' }, el('h2', {}, 'The story'), el('p', { class: 'story' }, storySpans)) : null,
    descSpans.length ? el('section', { class: 'card' }, el('h2', {}, 'What it is'), el('p', {}, descSpans)) : null,
    day.stats?.length ? el('section', { class: 'card' }, el('h2', {}, 'Numbers'), statsGrid(day.stats)) : null,
    el('section', { class: 'card game-card' },
      el('h2', {}, 'Take it for a drive'),
      carCard(day, accent),
      el('p', { class: 'hint' }, 'Tap left or right to change lanes. Swipe works too. One hit ends the run.'),
      gameMount),
    day.sources?.length ? el('footer', { class: 'sources' }, 'Sources: ',
      day.sources.map((s, i) => [i ? ' · ' : null, el('a', { href: s, target: '_blank', rel: 'noopener' }, hostOf(s))])) : null,
  ].filter(present));
  new Game(gameMount, day);

  // Hand-picked photos win; otherwise a photoQuery is resolved against Wikimedia Commons here.
  if (day.photos?.length) photoSlot.replaceWith(photoStrip(day.photos));
  else if (day.photoQuery) {
    void fetchCommonsPhotos(day.photoQuery, PHOTO_COUNT, day.date)
      .then(photos => { if (photos.length) photoSlot.replaceWith(photoStrip(photos)); else photoSlot.remove(); })
      .catch(() => photoSlot.remove());
  } else photoSlot.remove();
}

/* ---------- photos from Wikimedia Commons (mirrors scripts/commons.mjs) ---------- */
/** @typedef {{ url: string, thumburl?: string, descriptionurl: string, width: number, height: number, mime?: string, extmetadata?: Record<string, { value?: string }> }} CommonsImageInfo */
/** @typedef {{ title: string, imageinfo?: CommonsImageInfo[] }} CommonsPage */
/** @typedef {{ t: number, p: Photo[] }} PhotoCache */

const OK_LICENSE = /^(cc0|public domain|pd[- ]|cc[- ]by(?:[- ]sa)?(?: \d(\.\d)?)?$)/i;
const BAD_LICENSE = /(nc|nd|non-commercial|no derivatives|fair use|copyright)/i;
const BAD_TITLE = /logo|badge|emblem|brochure|advert|scan|drawing|diagram|model car|toy|scale model|lego/i;
const YEAR = /^(19|20)\d\d$/;

/** @param {string | undefined} html */
const stripHtml = html => (html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/**
 * @param {unknown} value
 * @returns {value is PhotoCache}
 */
function isPhotoCache(value) {
  return typeof value === 'object' && value !== null && 'p' in value && Array.isArray(value.p) && 't' in value && typeof value.t === 'number';
}

/**
 * @param {string} query
 * @param {number} want
 * @param {string} date cache key
 * @returns {Promise<Photo[]>}
 */
async function fetchCommonsPhotos(query, want, date) {
  const cacheKey = `daytrip.photos.${date}`;
  const cached = getJson(cacheKey);
  if (isPhotoCache(cached) && Date.now() - cached.t < PHOTO_CACHE_MS && cached.p.length) return cached.p;

  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.search = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '40',
    prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '800',
  }).toString();
  const res = await fetch(api);
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  /** @type {{ query?: { pages?: Record<string, CommonsPage> } }} */
  const json = await res.json();
  const pages = Object.values(json.query?.pages ?? {});
  const tokens = query.split(/\s+/).filter(t => t.length > 2 && !YEAR.test(t)).map(t => t.toLowerCase());

  /** @type {{ score: number, key: string, photo: Photo }[]} */
  const picks = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value);
    const credit = stripHtml(meta.Artist?.value) || stripHtml(meta.Credit?.value) || 'Unknown';
    if (!/^image\/(jpeg|png)$/.test(info.mime ?? '') || !OK_LICENSE.test(license) || BAD_LICENSE.test(license) || info.width < PHOTO_MIN_WIDTH) continue;
    const title = stripHtml(page.title).replace(/^File:/, '');
    if (BAD_TITLE.test(title)) continue;
    const lowerTitle = title.toLowerCase();
    const hits = tokens.filter(t => lowerTitle.includes(t)).length;
    if (tokens.length && !hits) continue;
    const url = info.thumburl ?? info.url; // the API-issued URL verbatim; hand-edited sizes return 400
    picks.push({
      score: hits * 1.5 + (info.width >= info.height ? 2 : 0) + Math.min(2, info.width / 2000),
      key: lowerTitle.replace(/[^a-z0-9]/g, '').slice(0, 24),
      photo: { url, thumb: url, credit: credit.slice(0, 80), license, source: info.descriptionurl, alt: title.replace(/\.(jpe?g|png)$/i, '').replace(/_/g, ' ') },
    });
  }
  picks.sort((a, b) => b.score - a.score);

  const seen = new Set();
  /** @type {Photo[]} */
  const out = [];
  for (const pick of picks) {
    if (seen.has(pick.key)) continue;
    seen.add(pick.key);
    out.push(pick.photo);
    if (out.length >= want) break;
  }
  setJson(cacheKey, /** @type {PhotoCache} */ ({ t: Date.now(), p: out }));
  return out;
}

/** @param {Photo[]} photos */
function photoStrip(photos) {
  return el('div', { class: 'photos' }, photos.map(p => el('figure', {},
    el('img', { src: p.thumb ?? p.url, alt: p.alt ?? '', loading: 'lazy', decoding: 'async', onerror: (/** @type {Event} */ e) => /** @type {Element} */ (e.target).closest('figure')?.remove() }),
    el('figcaption', {}, [p.credit, p.license].filter(Boolean).join(' · '), p.source ? [' · ', el('a', { href: p.source, target: '_blank', rel: 'noopener' }, 'source')] : null),
  )));
}

/* ---------- car card ---------- */
/**
 * The day's sprite blown up above the game so the pixel art gets looked at rather than
 * glimpsed at 16 px. Reads the same `sprite` block the game does.
 * @param {DayFile} day
 * @param {string} accent
 */
function carCard(day, accent) {
  const art = buildSprite(day.sprite, accent);
  const label = `Pixel drawing of the ${[day.year, day.name].filter(Boolean).join(' ')}`;
  const canvas = el('canvas', { class: 'car-art', width: art.width * CARD_SCALE, height: art.height * CARD_SCALE, role: 'img', 'aria-label': label });
  const g = ctx2d(canvas);
  g.imageSmoothingEnabled = false;
  g.drawImage(art, 0, 0, canvas.width, canvas.height);
  return el('div', { class: 'car-card' }, canvas);
}

/** @param {Stat[]} stats */
function statsGrid(stats) {
  return el('div', { class: 'stats' }, stats.map(s => el('div', { class: 'stat' }, el('b', {}, s.value), el('span', {}, s.label))));
}

/** @param {string} message */
function showError(message) {
  must('#app').replaceChildren(el('section', { class: 'card' },
    el('h2', {}, 'Could not load today'),
    el('p', { class: 'error' }, message),
    el('p', { class: 'maker' }, 'Try the ', el('a', { href: 'archive.html' }, 'garage'), ' instead.')));
}

/* ---------- read aloud ---------- */
const PREFERRED_VOICE = /Samantha|Ava|Google US|Natural|Aria|Jenny|Premium|Enhanced/i;

class Speaker {
  static supported = 'speechSynthesis' in window;
  /** @type {HTMLSpanElement[]} */ #spans;
  /** @type {HTMLButtonElement} */ #btn;
  /** @type {SpeechSynthesisVoice | null} */ #voice = null;
  /** @type {HTMLSpanElement | null} */ #current = null;
  #index = 0;
  #playing = false;

  /**
   * @param {HTMLSpanElement[]} spans one per sentence, in reading order
   * @param {HTMLButtonElement} btn
   */
  constructor(spans, btn) {
    this.#spans = spans;
    this.#btn = btn;
    this.#pickVoice();
    speechSynthesis.addEventListener('voiceschanged', () => this.#pickVoice());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.#playing) this.stop(); });
  }

  #pickVoice() {
    const voices = speechSynthesis.getVoices();
    this.#voice = voices.find(v => /^en[-_]US/i.test(v.lang) && PREFERRED_VOICE.test(v.name))
      ?? voices.find(v => /^en[-_]US/i.test(v.lang))
      ?? voices.find(v => /^en/i.test(v.lang))
      ?? null;
  }

  toggle() { if (this.#playing) this.stop(); else this.start(); }

  start() {
    if (!this.#spans.length) return;
    if (this.#index >= this.#spans.length) this.#index = 0;
    this.#playing = true;
    this.#btn.textContent = '■ Stop';
    this.#btn.setAttribute('aria-pressed', 'true');
    speechSynthesis.cancel();
    this.#next();
  }

  stop() {
    this.#playing = false;
    speechSynthesis.cancel();
    this.#highlight(null);
    this.#btn.textContent = this.#index > 0 && this.#index < this.#spans.length ? '▶ Resume' : '▶ Listen';
    this.#btn.setAttribute('aria-pressed', 'false');
  }

  /** @param {HTMLSpanElement | null} span */
  #highlight(span) {
    this.#current?.classList.remove('hl');
    this.#current = span;
    span?.classList.add('hl');
  }

  #next() {
    if (!this.#playing) return;
    if (this.#index >= this.#spans.length) { this.#index = 0; this.stop(); return; }
    const span = this.#spans[this.#index];
    this.#highlight(span);
    if (this.#index > 0) span.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const utterance = new SpeechSynthesisUtterance((span.textContent ?? '').trim());
    if (this.#voice) utterance.voice = this.#voice;
    utterance.onend = () => { if (this.#playing) { this.#index++; this.#next(); } };
    utterance.onerror = e => { if (this.#playing && e.error !== 'interrupted' && e.error !== 'canceled') { this.#index++; this.#next(); } };
    speechSynthesis.speak(utterance);
  }
}

/* ---------- boot ---------- */
export function boot() {
  loadDay().then(render).catch((/** @type {unknown} */ err) => showError(err instanceof Error ? err.message : String(err)));
}
