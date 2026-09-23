/* Daytrip — the day page: loads the day file, renders it, reads it aloud, and
   mounts the game into it. Conventions: everything optional in the day file has
   a fallback here. */
import { $, el } from './dom.js';
import { Game } from './game.js';
import { buildSprite, DEFAULT_SPRITE } from './render.js';

const CLASS_LABEL = {
  road: 'Road car', exotic: 'Exotic', rally: 'Rally', f1: 'Formula 1', gt3: 'GT3',
  lemans: 'Le Mans', jdm: 'JDM', muscle: 'Muscle', offroad: 'Off-road',
  vintage: 'Vintage', touring: 'Touring car', concept: 'Concept',
};

/* ---------- load ---------- */
async function loadDay() {
  const d = new URLSearchParams(location.search).get('d');
  const file = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `days/${d}.json` : 'days/latest.json';
  const res = await fetch(`${file}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

/* ---------- text helpers ---------- */
/* A full stop only ends a sentence if what follows looks like a new one. Guards, in order:
   a decimal point ("3.3-litre"), a single-letter initial ("J. Bugatti"), a known abbreviation
   ("St. Moritz"), no whitespace after, or a lower-case word next. Everything else splits. */
const ABBREV = /(?:^|[\s("'‘“])(?:mr|mrs|ms|dr|prof|rev|st|mt|sr|jr|vs|etc|no|fig|approx|dept|vol|co|inc|ltd|ave|rd|e\.g|i\.e|a\.m|p\.m|u\.s|u\.k)\.$/i;
const INITIAL = /(?:^|[\s("'‘“])[A-Z]\.$/;
function splitSentences(t) {
  const text = (t || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== '.' && c !== '!' && c !== '?') continue;
    if (c === '.' && /\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || '')) continue;
    let j = i;                                                              // "?!" and closing quotes ride along
    while (j + 1 < text.length && '.!?'.includes(text[j + 1])) j++;
    while (j + 1 < text.length && '"\')]’”'.includes(text[j + 1])) j++;
    const rest = text.slice(j + 1);
    if (rest && rest[0] !== ' ') { i = j; continue; }
    const nxt = rest.slice(1)[0];
    if (nxt && !/[A-Z0-9"'(‘“]/.test(nxt)) { i = j; continue; }
    const head = text.slice(start, i + 1);
    if (c === '.' && (INITIAL.test(head) || ABBREV.test(head))) { i = j; continue; }
    out.push(text.slice(start, j + 1).trim());
    start = j + 1;
    i = j;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean);
}
const sentenceSpans = text => splitSentences(text).map(s => el('span', { class: 'sent' }, s + ' '));
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const fmtDate = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return d; } };

/* ---------- page ---------- */
function render(day) {
  const accent = day.game?.accent || '#ff8a3d';
  document.documentElement.style.setProperty('--accent', accent);
  $('meta[name=theme-color]')?.setAttribute('content', '#0b0d10');
  document.title = `${day.year ? day.year + ' ' : ''}${day.name} — Daytrip`;

  const hookS = sentenceSpans(day.hook);
  const storyS = sentenceSpans(day.story);
  const descS = sentenceSpans(day.description);

  const speakBtn = el('button', { class: 'btn speak', type: 'button', 'aria-pressed': 'false' }, '▶ Listen');
  const speaker = new Speaker([...hookS, ...storyS, ...descS], speakBtn);
  speakBtn.addEventListener('click', () => speaker.toggle());
  if (!('speechSynthesis' in window)) { speakBtn.disabled = true; speakBtn.textContent = 'Listen (not supported here)'; }

  const app = $('#app');
  app.replaceChildren(
    el('section', { class: 'card hero' },
      el('div', { class: 'meta' }, el('span', { class: 'badge' }, CLASS_LABEL[day.class] || day.class || 'Car'), el('span', {}, fmtDate(day.date))),
      el('h1', {}, day.year ? el('span', { class: 'year' }, day.year) : null, day.year ? ' ' : null, day.name),
      el('p', { class: 'maker' }, [day.maker, day.country].filter(Boolean).join(' · ')),
      day.hook ? el('p', { class: 'hook' }, hookS) : null,
      speakBtn),
    el('div', { class: 'photo-slot' }),
    day.story ? el('section', { class: 'card' }, el('h2', {}, 'The story'), el('p', { class: 'story' }, storyS)) : null,
    day.description ? el('section', { class: 'card' }, el('h2', {}, 'What it is'), el('p', {}, descS)) : null,
    day.stats?.length ? el('section', { class: 'card' }, el('h2', {}, 'Numbers'), statsGrid(day.stats)) : null,
    el('section', { class: 'card game-card' },
      el('h2', {}, 'Take it for a drive'),
      carCard(day, accent),
      el('p', { class: 'hint' }, 'Tap left or right to change lanes. Swipe works too. One hit ends the run.'),
      el('div', { id: 'game' })),
    day.sources?.length ? el('footer', { class: 'sources' }, 'Sources: ',
      day.sources.map((s, i) => [i ? ' · ' : null, el('a', { href: s, target: '_blank', rel: 'noopener' }, hostOf(s))])) : null,
  );
  new Game($('#game'), day);

  // Photos: hand-picked `photos` win; otherwise a `photoQuery` is resolved against Wikimedia Commons in the browser.
  const slot = $('.photo-slot');
  if (day.photos?.length) slot.replaceWith(photoStrip(day.photos));
  else if (day.photoQuery) fetchCommonsPhotos(day.photoQuery, 3, day.date).then(ps => ps.length ? slot.replaceWith(photoStrip(ps)) : slot.remove()).catch(() => slot.remove());
  else slot.remove();
}

/* ---------- photos from Wikimedia Commons (client-side; mirrors scripts/commons.mjs) ---------- */
const OK_LICENSE = /^(cc0|public domain|pd[- ]|cc[- ]by(?:[- ]sa)?(?: \d(\.\d)?)?$)/i;
const BAD_LICENSE = /(nc|nd|non-commercial|no derivatives|fair use|copyright)/i;
const BAD_TITLE = /logo|badge|emblem|brochure|advert|scan|drawing|diagram|model car|toy|scale model|lego/i;
const stripHtml = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
async function fetchCommonsPhotos(query, want = 3, cacheKey = '') {
  const key = cacheKey ? `daytrip.photos.${cacheKey}` : '';
  try { const c = key && JSON.parse(localStorage.getItem(key) || 'null'); if (c && Date.now() - c.t < 864e5 && Array.isArray(c.p) && c.p.length) return c.p; } catch {}
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.search = new URLSearchParams({ action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '40', prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '800' });
  const res = await fetch(api); if (!res.ok) throw new Error(`Commons ${res.status}`);
  const pages = Object.values((await res.json())?.query?.pages || {});
  const tokens = query.split(/\s+/).filter(t => t.length > 2 && !/^(19|20)\d\d$/.test(t));
  const picks = pages.map(p => {
    const ii = p.imageinfo?.[0]; if (!ii) return null; const md = ii.extmetadata || {};
    const license = stripHtml(md.LicenseShortName?.value), credit = stripHtml(md.Artist?.value) || stripHtml(md.Credit?.value) || 'Unknown';
    if (!/^image\/(jpeg|png)$/.test(ii.mime || '') || !OK_LICENSE.test(license) || BAD_LICENSE.test(license) || (ii.width || 0) < 900) return null;
    const title = stripHtml(p.title).replace(/^File:/, ''); if (BAD_TITLE.test(title)) return null;
    const hits = tokens.filter(t => title.toLowerCase().includes(t.toLowerCase())).length; if (tokens.length && !hits) return null;
    const score = hits * 1.5 + (ii.width >= ii.height ? 2 : 0) + Math.min(2, ii.width / 2000);
    const url = ii.thumburl || ii.url; // use the API-issued URL verbatim; hand-edited sizes return 400
    return { score, key: title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24), photo: { url, thumb: url, credit: credit.slice(0, 80), license, source: ii.descriptionurl, alt: title.replace(/\.(jpe?g|png)$/i, '').replace(/_/g, ' ') } };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
  const seen = new Set(), out = [];
  for (const p of picks) { if (seen.has(p.key)) continue; seen.add(p.key); out.push(p.photo); if (out.length >= want) break; }
  try { if (key) localStorage.setItem(key, JSON.stringify({ t: Date.now(), p: out })); } catch {}
  return out;
}

function photoStrip(photos) {
  return el('div', { class: 'photos' }, photos.map(p => el('figure', {},
    el('img', { src: p.thumb || p.url, alt: p.alt || '', loading: 'lazy', decoding: 'async', onerror: e => e.target.closest('figure').remove() }),
    el('figcaption', {}, [p.credit, p.license].filter(Boolean).join(' · '), p.source ? [' · ', el('a', { href: p.source, target: '_blank', rel: 'noopener' }, 'source')] : null),
  )));
}

/* ---------- car card ---------- */
/* The day's sprite blown up above the game, so the pixel art gets looked at rather than
   glimpsed at 16 px. It reads the same `sprite` block the game does — no new day-file
   field — falls back to the engine's default sprite, and returns null (no card at all)
   if the sprite cannot be drawn, which is why every day before this one still renders. */
const CARD_SCALE = 6;
const usableSprite = sp => sp && sp.w > 0 && sp.h > 0 && Array.isArray(sp.rows) && sp.rows.length ? sp : DEFAULT_SPRITE;
function carCard(day, accent) {
  try {
    const art = buildSprite(usableSprite(day.sprite), accent);
    const label = `Pixel drawing of the ${[day.year, day.name].filter(Boolean).join(' ')}`;
    const c = el('canvas', { class: 'car-art', width: art.width * CARD_SCALE, height: art.height * CARD_SCALE, role: 'img', 'aria-label': label });
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(art, 0, 0, c.width, c.height);
    return el('div', { class: 'car-card' }, c);
  } catch { return null; }
}

function statsGrid(stats) {
  return el('div', { class: 'stats' }, stats.map(s => el('div', { class: 'stat' }, el('b', {}, s.value), el('span', {}, s.label))));
}

function showError(msg) {
  $('#app').replaceChildren(el('section', { class: 'card' }, el('h2', {}, 'Could not load today'), el('p', { class: 'error' }, msg), el('p', { class: 'maker' }, 'Try the ', el('a', { href: 'archive.html' }, 'garage'), ' instead.')));
}

/* ---------- read aloud ---------- */
class Speaker {
  constructor(spans, btn) {
    this.spans = spans; this.btn = btn; this.i = 0; this.playing = false; this.voice = null;
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find(v => /^en[-_]US/i.test(v.lang) && /Samantha|Ava|Google US|Natural|Aria|Jenny|Premium|Enhanced/i.test(v.name))
        || vs.find(v => /^en[-_]US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
    };
    pick(); speechSynthesis.addEventListener('voiceschanged', pick);
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.playing) this.stop(); });
  }
  toggle() { this.playing ? this.stop() : this.start(); }
  start() {
    if (!this.spans.length) return;
    if (this.i >= this.spans.length) this.i = 0;
    this.playing = true; this.btn.textContent = '■ Stop'; this.btn.setAttribute('aria-pressed', 'true');
    speechSynthesis.cancel(); this.next();
  }
  stop() {
    this.playing = false; speechSynthesis.cancel(); this.clearHl();
    this.btn.textContent = this.i > 0 && this.i < this.spans.length ? '▶ Resume' : '▶ Listen';
    this.btn.setAttribute('aria-pressed', 'false');
  }
  clearHl() { this.spans.forEach(s => s.classList.remove('hl')); }
  next() {
    if (!this.playing) return;
    if (this.i >= this.spans.length) { this.i = 0; this.stop(); return; }
    const span = this.spans[this.i]; this.clearHl(); span.classList.add('hl');
    if (this.i > 0) span.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    const u = new SpeechSynthesisUtterance(span.textContent.trim());
    if (this.voice) u.voice = this.voice;
    u.rate = 1; u.pitch = 1;
    u.onend = () => { if (this.playing) { this.i++; this.next(); } };
    u.onerror = e => { if (this.playing && e.error !== 'interrupted' && e.error !== 'canceled') { this.i++; this.next(); } };
    speechSynthesis.speak(u);
  }
}

/* ---------- boot ---------- */
export function boot() {
  loadDay().then(render).catch(e => { console.error(e); showError(e.message || String(e)); });
}
