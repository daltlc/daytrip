// @ts-check
/* Daytrip — the day page: loads the day file, renders it, reads it aloud, and mounts the game
   into it. Everything optional in the day file has a fallback here. */
/** @import { DayFile, Photo, Stat, CarClass } from './types.js' */
import { el, must, ctx2d, present } from './dom.js';
import { Game } from './game.js';
import { buildSprite } from './render.js';
import { getJson, setJson, recentPicks, rememberPick } from './storage.js';
import { splitSentences } from './text.js';
import { classLabel } from './classes.js';
import { findPhotos, licenseDeed } from './photos.js';
import { applyTheme } from './theme.js';

const DEFAULT_ACCENT = '#ff8a3d';
const PHOTO_COUNT = 3;
const PHOTO_CACHE_MS = 24 * 60 * 60 * 1000;
const PHOTO_CACHE_VERSION = 'v3';
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
  applyTheme(accent);
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
    el('p', { class: 'credit-note' }, 'Written by Claude, an AI model, from the sources credited ', el('a', { href: '#credits' }, 'below'), '.'),
    el('section', { class: 'card game-card' },
      el('h2', {}, 'Take it for a drive'),
      carCard(day, accent),
      el('p', { class: 'hint' }, 'Tap left or right to change lanes. Swipe works too. One hit ends the run.'),
      gameMount),
    creditsCard(day),
    el('p', { class: 'day-surprise' }, surpriseLink(day.date),
      day.class ? [' · ', surpriseLink(day.date, day.class)] : null),
  ].filter(present));
  new Game(gameMount, day);

  // Hand-picked photos win; otherwise the article's lead image and a Commons search are resolved here.
  if (day.photos?.length) photoSlot.replaceWith(photoStrip(day.photos));
  else if (day.photoQuery || day.wikiTitle) {
    void cachedPhotos(day)
      .then(photos => { if (photos.length) photoSlot.replaceWith(photoStrip(photos)); else photoSlot.remove(); })
      .catch(() => photoSlot.remove());
  } else photoSlot.remove();
}

/** @type {Promise<unknown> | null} */
let indexOnce = null;

/**
 * `days/index.json`, fetched at most once per page view and shared by both surprise links, so a second tap
 * (or a return through the back-forward cache) reuses it. A failed fetch or a non-OK
 * response is forgotten, so the next tap retries.
 * @returns {Promise<unknown>}
 */
function surpriseIndex() {
  indexOnce ??= fetch(`days/index.json?v=${Date.now()}`, { cache: 'no-store' })
    .then(res => { if (!res.ok) throw new Error(`index ${res.status}`); return res.json(); })
    .catch(err => { indexOnce = null; throw err; });
  return indexOnce;
}

/**
 * "Surprise me" at the foot of the day: a random other car from `days/index.json`, never the one on screen, and not one of the
 * last few cars a surprise link (here or in the garage) picked this session while others are left.
 * Given a class, it is "More Le Mans →" and draws only from that class. The index is fetched on the first tap, not
 * on load, so a reader who never taps pays nothing, and both links share that one fetch. If the fetch fails,
 * the link falls through to its plain `href`, the garage (filtered to the class, if there is one). If there is no other day to
 * draw, the tap relabels the link "Back to the garage →" (naming the class when there is one) and the next tap follows it.
 * @param {string} current the date on screen
 * @param {CarClass} [cls] only draw cars of this class
 * @returns {HTMLAnchorElement}
 */
function surpriseLink(current, cls) {
  const link = cls
    ? el('a', { class: 'g-surprise', href: `archive.html?class=${encodeURIComponent(cls)}` }, `More ${classLabel(cls)} →`)
    : el('a', { class: 'g-surprise', href: 'archive.html' }, 'Surprise me →');
  // Set once a tap finds no other car to draw: the link has been relabelled, and the next tap is a plain garage link.
  let exhausted = false;
  link.addEventListener('click', e => {
    if (exhausted) return;
    e.preventDefault();
    void surpriseIndex()
      .then((/** @type {unknown} */ days) => {
        const dates = Array.isArray(days)
          ? days.map(d => (d && typeof d.date === 'string' && (!cls || d.class === cls) ? d.date : '')).filter(d => DATE.test(d) && d !== current)
          : [];
        // Skip the last few cars either surprise link picked this session, while others are left.
        const recent = recentPicks();
        const fresh = dates.filter(d => !recent.includes(d));
        const pool = fresh.length ? fresh : dates;
        if (!pool.length) {
          // Say so rather than jump silently: the label now names where the next tap goes.
          exhausted = true;
          link.textContent = cls ? `No other ${classLabel(cls)} car yet · Back to the garage →` : 'Back to the garage →';
          return;
        }
        const pick = pool[Math.floor(Math.random() * pool.length)];
        rememberPick(pick);
        location.href = `index.html?d=${encodeURIComponent(pick)}`;
      })
      // Offline or a bad index: the garage is the next best thing.
      .catch(() => { location.href = link.href; });
  });
  return link;
}

/* ---------- photos (photos.js does the finding; this caches it per day) ---------- */
/** @typedef {{ t: number, p: Photo[] }} PhotoCache */

/**
 * @param {unknown} value
 * @returns {value is PhotoCache}
 */
function isPhotoCache(value) {
  return typeof value === 'object' && value !== null && 'p' in value && Array.isArray(value.p) && 't' in value && typeof value.t === 'number';
}

/**
 * The day's photos, cached for a day so a revisit does not hit Wikimedia again. The key carries
 * a version so photos cached by an older lookup are not reused.
 * @param {DayFile} day
 * @returns {Promise<Photo[]>}
 */
async function cachedPhotos(day) {
  const cacheKey = `daytrip.photos.${PHOTO_CACHE_VERSION}.${day.date}`;
  const cached = getJson(cacheKey);
  if (isPhotoCache(cached) && Date.now() - cached.t < PHOTO_CACHE_MS && cached.p.length) return cached.p;
  const photos = await findPhotos({ query: day.photoQuery, wikiTitle: day.wikiTitle, want: PHOTO_COUNT });
  if (photos.length) setJson(cacheKey, /** @type {PhotoCache} */ ({ t: Date.now(), p: photos }));
  return photos;
}

/** @param {Photo[]} photos */
function photoStrip(photos) {
  return el('div', { class: 'photos' }, photos.map(p => el('figure', {},
    el('img', { src: p.thumb ?? p.url, alt: p.alt ?? '', loading: 'lazy', decoding: 'async', onerror: (/** @type {Event} */ e) => /** @type {Element} */ (e.target).closest('figure')?.remove() }),
    photoCaption(p),
  )));
}

/**
 * The full credit Creative Commons asks for: the work's title linked to its source, its author,
 * and its license linked to the license text, plus where it is hosted.
 * @param {Photo} p
 */
function photoCaption(p) {
  const title = p.alt ? `“${p.alt}”` : 'Photo';
  const deed = p.licenseUrl ?? licenseDeed(p.license);
  return el('figcaption', {},
    p.source ? el('a', { href: p.source, target: '_blank', rel: 'noopener' }, title) : title,
    p.credit ? ` by ${p.credit}` : null,
    p.license ? [', ', deed ? el('a', { href: deed, target: '_blank', rel: 'noopener license' }, p.license) : p.license] : null,
    ', via Wikimedia Commons');
}

/* ---------- credits ---------- */
const WIKIPEDIA_LICENSE = { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' };

/**
 * A readable name for a source: "Wikipedia: <article>" for Wikipedia, otherwise the site.
 * @param {string} url
 * @returns {{ label: string, wikipedia: boolean }}
 */
function sourceLabel(url) {
  const host = hostOf(url);
  const article = /(?:^|\.)wikipedia\.org$/.test(host) ? /\/wiki\/([^?#]+)/.exec(new URL(url).pathname)?.[1] : undefined;
  if (!article) return { label: host, wikipedia: false };
  let title = article;
  try { title = decodeURIComponent(article); } catch { /* keep the raw slug */ }
  return { label: `Wikipedia: ${title.replace(/_/g, ' ')}`, wikipedia: true };
}

/**
 * Every source the day's text was written from, who wrote it, and where the photos and pixel art
 * come from. Placed after the game so the day reads straight through, and linked from a note
 * directly under the text.
 * @param {DayFile} day
 */
function creditsCard(day) {
  const sources = day.sources ?? [];
  return el('section', { class: 'card credits', id: 'credits' },
    el('h2', {}, 'Sources and credits'),
    el('p', {}, 'The hook, story, description and numbers on this page were written by Claude, an AI model made by Anthropic, in its own words from these sources. Facts and figures belong to them.'),
    sources.length
      ? el('ul', { class: 'credit-list' }, sources.map(url => {
        const { label, wikipedia } = sourceLabel(url);
        return el('li', {}, el('a', { href: url, target: '_blank', rel: 'noopener' }, label),
          wikipedia ? [' · text under ', el('a', { href: WIKIPEDIA_LICENSE.url, target: '_blank', rel: 'noopener license' }, WIKIPEDIA_LICENSE.name), ', by Wikipedia contributors'] : null);
      }))
      : el('p', { class: 'maker' }, 'No sources were recorded for this day.'),
    el('p', {}, 'Photos come from Wikimedia Commons and Wikipedia, each credited under the photo with its author and license. The pixel art and the game were made by Claude for Daytrip.'));
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
