#!/usr/bin/env node
// Finds freely licensed photos of a car on Wikimedia Commons and prints ready-to-paste `photos` entries.
// Usage: node scripts/commons.mjs "Mazda 787B" 3
// Filters to CC0 / public domain / CC BY / CC BY-SA, JPEG or PNG, at least 900 px wide. Prints [] if nothing qualifies.
const [, , query, countArg] = process.argv;
if (!query) { console.error('usage: node scripts/commons.mjs "<car name>" [count]'); process.exit(2); }
const want = Math.max(1, Math.min(6, +countArg || 3));
const UA = 'daytrip/1.0 (https://github.com/daltlc/daytrip; personal daily car page)';

async function search(q, limit = 40) {
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.search = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(limit),
    prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '800',
  });
  const res = await fetch(api, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Commons API HTTP ${res.status}`);
  const json = await res.json();
  return Object.values(json?.query?.pages || {});
}
const strip = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const OK_LICENSE = /^(cc0|public domain|pd[- ]|cc[- ]by(?:[- ]sa)?(?: \d(\.\d)?)?$)/i;
const BAD = /(nc|nd|non-commercial|no derivatives|fair use|copyright)/i;

const pages = await search(query).catch(e => { console.error(e.message); return []; });
const picks = pages.map(p => {
  const ii = p.imageinfo?.[0]; if (!ii) return null;
  const md = ii.extmetadata || {};
  const license = strip(md.LicenseShortName?.value);
  const artist = strip(md.Artist?.value) || strip(md.Credit?.value) || 'Unknown';
  if (!/^image\/(jpeg|png)$/.test(ii.mime || '')) return null;
  if (!OK_LICENSE.test(license) || BAD.test(license)) return null;
  if ((ii.width || 0) < 900) return null;
  const title = strip(p.title).replace(/^File:/, '');
  if (/logo|badge|emblem|brochure|advert|scan|drawing|diagram|model car|toy|scale model|lego/i.test(title)) return null;
  const landscape = ii.width >= ii.height;
  const tokens = query.split(/\s+/).filter(t => t.length > 2 && !/^(19|20)\d\d$/.test(t));
  const nameHits = tokens.filter(t => title.toLowerCase().includes(t.toLowerCase())).length;
  if (tokens.length && nameHits === 0) return null; // title must mention the car at least once
  const score = nameHits * 1.5 + (landscape ? 2 : 0) + Math.min(2, ii.width / 2000) + (/(race|racing|circuit|track|le mans|rally|stage|goodwood|museum)/i.test(title) ? 0.5 : 0);
  const url = ii.thumburl || ii.url; // use the API-issued thumb URL verbatim; hand-edited sizes return 400
  return {
    score,
    photo: { url, thumb: url, credit: artist.slice(0, 80), license, source: ii.descriptionurl, alt: title.replace(/\.(jpe?g|png)$/i, '').replace(/_/g, ' ') },
  };
}).filter(Boolean).sort((a, b) => b.score - a.score);

// avoid near-duplicate uploads of the same shot
const seen = new Set(); const out = [];
for (const { photo } of picks) {
  const key = photo.alt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  if (seen.has(key)) continue; seen.add(key); out.push(photo);
  if (out.length >= want) break;
}
console.log(JSON.stringify(out, null, 2));
