// @ts-check
/* Daytrip — the day page: loads the day file, renders it, reads it aloud, and mounts the game
   into it. Everything optional in the day file has a fallback here. */
/** @import { DayFile, Photo, Stat, CarClass } from './types.js' */
import { el, must, ctx2d, present } from './dom.js';
import { Game } from './game.js';
import { buildSprite } from './render.js';
import { getJson, setJson } from './storage.js';
import { splitSentences } from './text.js';
import { classLabel } from './classes.js';

const DEFAULT_ACCENT = '#ff8a3d';
const THEME_COLOR = '#0b0d10';
const PHOTO_COUNT = 3;
const PHOTO_CACHE_MS = 24 * 60 * 60 * 1000;
const PHOTO_MIN_WIDTH = 900;
const CARD_SCALE = 6;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- load ---------- */
/** @returns {Promise<DayFile>} */
async function loadDay() {
  const requested = new URLSearchParams(location.search).get('d');
  const file = requested && DATE.test(requested) ? `days/${requested}.json` : 'days/latest.json';
  const res = await fetch(`${file}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return /** @type {Promise<DayFile>} */ (res.json());
}

/* ---------- text ---------- */
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
      el('div', { class: 'meta' }, el('span', { class: 'badge' }, (day.class && classLabel(day.class)) || 'Car'), el('span', {}, fmtDate(day.date))),
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
    el('p', { class: 'day-surprise' }, surpriseLink(day.date),
      day.class ? [' · ', surpriseLink(day.date, day.class)] : null),
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

/**
 * "Surprise me" at the foot of the day: a random other car from `days/index.json`, never the one on screen.
 * Given a class, it is "More Le Mans →" and draws only from that class. The index is fetched on tap, not on
 * load, so a reader who never taps pays nothing. If the fetch fails or there is no other day to draw, the
 * link falls through to its plain `href`, the garage (filtered to the class, if there is one).
 * @param {string} current the date on screen
 * @param {CarClass} [cls] only draw cars of this class
 * @returns {HTMLAnchorElement}
 */
function surpriseLink(current, cls) {
  const link = cls
    ? el('a', { class: 'g-surprise', href: `archive.html?class=${encodeURIComponent(cls)}` }, `More ${classLabel(cls)} →`)
    : el('a', { class: 'g-surprise', href: 'archive.html' }, 'Surprise me →');
  link.addEventListener('click', e => {
    e.preventDefault();
    void fetch(`days/index.json?v=${Date.now()}`, { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : []))
      .then((/** @type {unknown} */ days) => {
        const dates = Array.isArray(days)
          ? days.map(d => (d && typeof d.date === 'string' && (!cls || d.class === cls) ? d.date : '')).filter(d => DATE.test(d) && d !== current)
          : [];
        location.href = dates.length ? `index.html?d=${encodeURIComponent(dates[Math.floor(Math.random() * dates.length)])}` : link.href;
      })
      // Offline or a bad index: the garage is the next best thing.
      .catch(() => { location.href = link.href; });
  });
  return link;
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
  return el('div', { class: 'stats' }, stats.map(s => el('div', { class: 'stat' }, el('b', {}, s.value), el('span', {}, s.label), statTag(s.tag))));
}

/**
 * The optional small tag after a stat's label ("race", "1974"). Anything that is
 * not a non-empty string draws nothing, so old days and odd values look as before.
 * @param {unknown} tag
 */
function statTag(tag) {
  return typeof tag === 'string' && tag.trim() ? el('i', { class: 'tag' }, tag.trim()) : null;
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
