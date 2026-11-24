// @ts-check
/* Daytrip — finds freely licensed photos of a car. Used by the page at view time and by
   scripts/commons.mjs, so both pick exactly the same photos. Two sources, merged and ranked:
   the lead image of the car's English Wikipedia article (`wikiTitle`), which editors chose as
   the picture of that car, and a Wikimedia Commons search (`photoQuery`). Every file is looked
   up on Commons, so only Commons files under CC0, public domain, CC BY or CC BY-SA are kept; a
   non-free lead image that Wikipedia hosts itself is simply not found there. The article's
   other images are deliberately ignored: they are often other generations, rivals or engines. */
/** @import { Photo } from './types.js' */

/** @typedef {{ url: string, thumburl?: string, descriptionurl: string, width: number, height: number, mime?: string, extmetadata?: Record<string, { value?: string }> }} ImageInfo */
/** @typedef {{ title: string, imageinfo?: ImageInfo[] }} FilePage */
/** @typedef {{ query?: { pages?: Record<string, FilePage> } }} FileQuery */
/** @typedef {{ score: number, key: string, photo: Photo }} Pick */

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const IMAGE_PROPS = { prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '800' };
const MIN_WIDTH = 900;
const SEARCH_LIMIT = '40';
const OK_LICENSE = /^(cc0|public domain|pd[- ]|cc[- ]by(?:[- ]sa)?(?: \d(\.\d)?)?$)/i;
const BAD_LICENSE = /(nc|nd|non-commercial|no derivatives|fair use|copyright)/i;
const BAD_TITLE = /logo|badge|emblem|brochure|advert|scan|drawing|diagram|model car|toy|scale model|lego/i;
const LEADING_YEAR = /^(19|20)\d\d\s+/;
const YEAR = /^(19|20)\d\d$/;
// Ranking: the article's lead image first, then a Commons file naming every word of the query,
// then partial Commons matches by how many words they name. A partial match needs at least two
// words: one shared word is how a Volvo Ocean Race yacht ends up on the Volvo Philip page.
const LEAD_SCORE = 10, FULL_MATCH_SCORE = 6, HIT_SCORE = 1.5, MIN_PARTIAL_HITS = 2;

const CREDIT_MAX = 120;

/**
 * The license text a short name like "CC BY-SA 3.0" or "CC0" refers to, for crediting photos that
 * carry only the name (hand-picked ones, or Commons files without a license link).
 * Public domain has no license text to link, so it gets none.
 * @param {string | undefined} license
 * @returns {string | undefined}
 */
export function licenseDeed(license) {
  const name = (license ?? '').trim().toLowerCase();
  if (/^cc0\b/.test(name)) return 'https://creativecommons.org/publicdomain/zero/1.0/';
  const cc = /^cc[- ]by(-sa)?[- ](\d\.\d)\b/.exec(name);
  return cc ? `https://creativecommons.org/licenses/by${cc[1] ?? ''}/${cc[2]}/` : undefined;
}

/** @param {string | undefined} html */
const stripHtml = html => (html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
/** @param {string} s */
const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Words a file title must contain to count as a photo of this car: the query minus years and
 * filler, accent-folded so "Skoda" in a file name matches "Škoda". Short model codes with a
 * digit ("M1", "55", "S1") are kept, since they are often the only word that names the car.
 * @param {string} query
 * @returns {string[]}
 */
function nameTokens(query) {
  return fold(query).split(/[\s/()"]+/).filter(t => !YEAR.test(t) && (t.length > 2 || (t.length === 2 && /\d/.test(t))));
}

/**
 * @param {string} api
 * @param {Record<string, string>} params
 * @param {HeadersInit} [headers]
 * @returns {Promise<unknown>}
 */
async function getJson(api, params, headers) {
  const url = new URL(api);
  url.search = new URLSearchParams({ format: 'json', origin: '*', ...params }).toString();
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`${url.hostname} ${res.status}`);
  return res.json();
}

/**
 * A file page turned into a ranked photo, or null if it fails the license, size or title rules.
 * @param {FilePage} page
 * @param {string[]} tokens
 * @param {(hits: number) => number} base score from how many name tokens the title holds
 * @returns {Pick | null}
 */
function toPick(page, tokens, base) {
  const info = page.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value);
  if (!/^image\/(jpeg|png)$/.test(info.mime ?? '') || !OK_LICENSE.test(license) || BAD_LICENSE.test(license) || info.width < MIN_WIDTH) return null;
  const title = stripHtml(page.title).replace(/^File:/, '');
  if (BAD_TITLE.test(title)) return null;
  const folded = fold(title);
  const hits = tokens.filter(t => folded.includes(t)).length;
  const score = base(hits);
  if (score <= 0) return null;
  const url = info.thumburl ?? info.url; // the API-issued URL verbatim; hand-edited sizes return 400
  const credit = stripHtml(meta.Artist?.value) || stripHtml(meta.Credit?.value) || 'Unknown';
  return {
    score: score + (info.width >= info.height ? 1 : 0) + Math.min(1, info.width / 4000),
    key: folded.replace(/[^a-z0-9]/g, '').slice(0, 24),
    photo: {
      url, thumb: url, credit: credit.length > CREDIT_MAX ? `${credit.slice(0, CREDIT_MAX - 1)}…` : credit, license,
      licenseUrl: (/^https?:\/\//.test(meta.LicenseUrl?.value ?? '') ? meta.LicenseUrl?.value : undefined) ?? licenseDeed(license),
      source: info.descriptionurl, alt: title.replace(/\.(jpe?g|png)$/i, '').replace(/_/g, ' '),
    },
  };
}

/**
 * Commons files whose titles match the query. The year is dropped before searching: Commons
 * matches every word against file titles, and almost no file title carries the model year.
 * @param {string} query
 * @param {string[]} tokens
 * @param {HeadersInit} [headers]
 * @returns {Promise<Pick[]>}
 */
async function searchCommons(query, tokens, headers) {
  const json = /** @type {FileQuery} */ (await getJson(COMMONS_API, {
    action: 'query', generator: 'search', gsrsearch: `${query.replace(LEADING_YEAR, '')} filetype:bitmap`, gsrnamespace: '6', gsrlimit: SEARCH_LIMIT, ...IMAGE_PROPS,
  }, headers));
  const all = tokens.length;
  return Object.values(json.query?.pages ?? {})
    .map(page => toPick(page, tokens, hits => (!all ? HIT_SCORE : hits === all ? FULL_MATCH_SCORE : hits >= MIN_PARTIAL_HITS ? hits * HIT_SCORE : 0)))
    .filter(/** @returns {p is Pick} */ p => p !== null);
}

/**
 * The lead image of a Wikipedia article, looked up on Commons. Empty when the article has no
 * lead image or Wikipedia hosts it locally (which means it is not freely licensed).
 * @param {string} title
 * @param {HeadersInit} [headers]
 * @returns {Promise<Pick[]>}
 */
async function articleLead(title, headers) {
  const lead = /** @type {{ query?: { pages?: Record<string, { pageimage?: string }> } }} */ (
    await getJson(WIKIPEDIA_API, { action: 'query', titles: title, redirects: '1', prop: 'pageimages', piprop: 'name' }, headers));
  const name = Object.values(lead.query?.pages ?? {})[0]?.pageimage;
  if (!name) return [];
  const file = /** @type {FileQuery} */ (await getJson(COMMONS_API, { action: 'query', titles: `File:${name}`, ...IMAGE_PROPS }, headers));
  const pick = Object.values(file.query?.pages ?? {}).map(page => toPick(page, [], () => LEAD_SCORE))[0];
  return pick ? [pick] : [];
}

/**
 * Up to `want` photos of the car, best first, from both sources. A source that fails is skipped
 * rather than failing the whole lookup.
 * @param {{ query?: string, wikiTitle?: string, want: number, headers?: HeadersInit }} options
 * @returns {Promise<Photo[]>}
 */
export async function findPhotos({ query, wikiTitle, want, headers }) {
  const tokens = nameTokens(query ?? wikiTitle ?? '');
  const settled = await Promise.allSettled([
    wikiTitle ? articleLead(wikiTitle, headers) : Promise.resolve([]),
    query ? searchCommons(query, tokens, headers) : Promise.resolve([]),
  ]);
  const picks = settled.flatMap(r => (r.status === 'fulfilled' ? r.value : [])).sort((a, b) => b.score - a.score);
  const seen = new Set();
  /** @type {Photo[]} */
  const out = [];
  for (const pick of picks) {
    if (seen.has(pick.key)) continue; // near-duplicate uploads of the same shot, or the same file from both sources
    seen.add(pick.key);
    out.push(pick.photo);
    if (out.length >= want) break;
  }
  return out;
}
