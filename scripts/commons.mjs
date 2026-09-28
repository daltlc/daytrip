#!/usr/bin/env node
// @ts-check
// Finds freely licensed photos of a car on Wikimedia Commons and prints ready-to-paste `photos`
// entries. Usage: node scripts/commons.mjs "Mazda 787B" 3
// Filters to CC0 / public domain / CC BY / CC BY-SA, JPEG or PNG, at least 900 px wide.
// Prints [] if nothing qualifies. Mirrors fetchCommonsPhotos in page.js.
/** @import { Photo } from '../types.js' */

/** @typedef {{ url: string, thumburl?: string, descriptionurl: string, width: number, height: number, mime?: string, extmetadata?: Record<string, { value?: string }> }} ImageInfo */
/** @typedef {{ title: string, imageinfo?: ImageInfo[] }} Page */

const [, , query, countArg] = process.argv;
if (!query) {
  process.stderr.write('usage: node scripts/commons.mjs "<car name>" [count]\n');
  process.exit(2);
}
const want = Math.max(1, Math.min(6, Number(countArg) || 3));
const USER_AGENT = 'daytrip/1.0 (https://github.com/daltlc/daytrip; personal daily car page)';
const MIN_WIDTH = 900;
const OK_LICENSE = /^(cc0|public domain|pd[- ]|cc[- ]by(?:[- ]sa)?(?: \d(\.\d)?)?$)/i;
const BAD_LICENSE = /(nc|nd|non-commercial|no derivatives|fair use|copyright)/i;
const BAD_TITLE = /logo|badge|emblem|brochure|advert|scan|drawing|diagram|model car|toy|scale model|lego/i;
const RACE_TITLE = /(race|racing|circuit|track|le mans|rally|stage|goodwood|museum)/i;
const YEAR = /^(19|20)\d\d$/;

/** @param {string | undefined} html */
const strip = html => (html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/**
 * @param {string} q
 * @param {number} [limit]
 * @returns {Promise<Page[]>}
 */
async function search(q, limit = 40) {
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.search = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(limit),
    prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '800',
  }).toString();
  const res = await fetch(api, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Commons API HTTP ${res.status}`);
  /** @type {{ query?: { pages?: Record<string, Page> } }} */
  const json = await res.json();
  return Object.values(json.query?.pages ?? {});
}

const pages = await search(query).catch((/** @type {unknown} */ e) => { process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`); return []; });
const tokens = query.split(/\s+/).filter(t => t.length > 2 && !YEAR.test(t)).map(t => t.toLowerCase());

/** @type {{ score: number, key: string, photo: Photo }[]} */
const picks = [];
for (const page of pages) {
  const info = page.imageinfo?.[0];
  if (!info) continue;
  const meta = info.extmetadata ?? {};
  const license = strip(meta.LicenseShortName?.value);
  const credit = strip(meta.Artist?.value) || strip(meta.Credit?.value) || 'Unknown';
  if (!/^image\/(jpeg|png)$/.test(info.mime ?? '') || !OK_LICENSE.test(license) || BAD_LICENSE.test(license) || info.width < MIN_WIDTH) continue;
  const title = strip(page.title).replace(/^File:/, '');
  if (BAD_TITLE.test(title)) continue;
  const lowerTitle = title.toLowerCase();
  const hits = tokens.filter(t => lowerTitle.includes(t)).length;
  if (tokens.length && !hits) continue; // the title must mention the car
  const url = info.thumburl ?? info.url; // the API-issued URL verbatim; hand-edited sizes return 400
  picks.push({
    score: hits * 1.5 + (info.width >= info.height ? 2 : 0) + Math.min(2, info.width / 2000) + (RACE_TITLE.test(title) ? 0.5 : 0),
    key: lowerTitle.replace(/[^a-z0-9]/g, '').slice(0, 24),
    photo: { url, thumb: url, credit: credit.slice(0, 80), license, source: info.descriptionurl, alt: title.replace(/\.(jpe?g|png)$/i, '').replace(/_/g, ' ') },
  });
}
picks.sort((a, b) => b.score - a.score);

// skip near-duplicate uploads of the same shot
const seen = new Set();
/** @type {Photo[]} */
const out = [];
for (const pick of picks) {
  if (seen.has(pick.key)) continue;
  seen.add(pick.key);
  out.push(pick.photo);
  if (out.length >= want) break;
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
