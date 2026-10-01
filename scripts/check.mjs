#!/usr/bin/env node
// @ts-check
// Validates every day file, index/latest consistency, module syntax, types, and local asset
// references. Usage: node scripts/check.mjs   (exit 1 on any error)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @import { DayFile, IndexEntry } from '../types.js' */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** @type {string[]} */
const errs = [];
/** @type {string[]} */
const warns = [];
const CLASSES = ['road', 'exotic', 'rally', 'f1', 'gt3', 'lemans', 'jdm', 'muscle', 'offroad', 'vintage', 'touring', 'concept'];
const OBSTACLES = ['cone', 'barrel', 'tire', 'rock', 'snow', 'crate', 'puddle'];
const SCENERY = ['city', 'mountain', 'desert', 'coast', 'forest', 'track', 'snow'];
const WEATHER = ['auto', 'none', 'rain', 'snow', 'dust'];
const LANE_COUNTS = [2, 3, 4];
const BANNED = /\b(forza|horizon festival|playground games|gran turismo|need for speed)\b/i;
const BROWSER_MODULES = ['app.js', 'dom.js', 'storage.js', 'geom.js', 'types.js', 'page.js', 'render.js', 'game.js', 'garage.js'];
const SCRIPTS = ['scripts/check.mjs', 'scripts/commons.mjs', 'scripts/roll.mjs'];
const CORE_FILES = ['index.html', 'archive.html', 'style.css', ...BROWSER_MODULES, 'days/latest.json'];
const MAX_CORE_KB = 400;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** @param {unknown} s */
const words = s => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
/** @param {unknown} u */
const isUrl = u => /^https?:\/\/\S+$/.test(String(u ?? ''));
/** @param {string} f @param {string} m */
const err = (f, m) => { errs.push(`${f}: ${m}`); };
/** @param {string} f @param {string} m */
const warn = (f, m) => { warns.push(`${f}: ${m}`); };
/** @param {string} line */
const print = line => { process.stdout.write(`${line}\n`); };

/**
 * @param {string} rel
 * @returns {unknown}
 */
function readJson(rel) {
  try { return JSON.parse(readFileSync(path.join(root, rel), 'utf8')); }
  catch (e) { err(rel, `invalid JSON — ${e instanceof Error ? e.message : String(e)}`); return null; }
}

/**
 * @param {string} f
 * @param {DayFile} d
 */
function checkDay(f, d) {
  for (const k of /** @type {const} */ (['date', 'name', 'year', 'maker', 'class', 'hook', 'story', 'description', 'stats', 'sprite', 'game', 'sources']))
    if (d[k] === undefined || d[k] === null) err(f, `missing "${k}"`);
  if (d.date && !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) err(f, `date must be YYYY-MM-DD, got "${d.date}"`);
  if (d.date && !f.includes('_template') && !f.endsWith('latest.json') && path.basename(f) !== `${d.date}.json`) err(f, `filename does not match date "${d.date}"`);
  if (d.year !== undefined && !(Number.isInteger(d.year) && d.year > 1880 && d.year < 2100)) err(f, `year must be an integer, got ${JSON.stringify(d.year)}`);
  if (d.class && !CLASSES.includes(d.class)) err(f, `class "${d.class}" not one of ${CLASSES.join(', ')}`);
  if (d.hook && words(d.hook) > 30) warn(f, `hook is ${words(d.hook)} words; keep it to one sentence`);
  const storyWords = words(d.story);
  if (d.story && (storyWords < 100 || storyWords > 220)) err(f, `story is ${storyWords} words; target 120–180`);
  const descWords = words(d.description);
  if (d.description && (descWords < 40 || descWords > 120)) err(f, `description is ${descWords} words; target 60–90`);
  for (const k of /** @type {const} */ (['hook', 'story', 'description'])) if (BANNED.test(d[k] ?? '')) err(f, `"${k}" mentions a game franchise; content must stand on its own`);

  if (Array.isArray(d.stats)) {
    if (d.stats.length < 3 || d.stats.length > 8) err(f, `stats has ${d.stats.length} items; target 5–7`);
    d.stats.forEach((s, i) => { if (!s || typeof s.label !== 'string' || typeof s.value !== 'string' || !s.label || !s.value) err(f, `stats[${i}] needs string label and value`); });
  } else if (d.stats !== undefined) err(f, 'stats must be an array');

  if (d.photos !== undefined) {
    if (!Array.isArray(d.photos)) err(f, 'photos must be an array');
    else {
      if (d.photos.length > 3) warn(f, `${d.photos.length} photos; 2–3 is plenty`);
      d.photos.forEach((p, i) => {
        if (!isUrl(p?.url)) err(f, `photos[${i}].url must be an http(s) URL`);
        if (p?.thumb && !isUrl(p.thumb)) err(f, `photos[${i}].thumb must be an http(s) URL`);
        if (!p?.credit) err(f, `photos[${i}].credit missing (author attribution is required)`);
        if (!p?.license) err(f, `photos[${i}].license missing`);
        if (!isUrl(p?.source)) err(f, `photos[${i}].source must link to the file page`);
      });
    }
  }
  if (d.photoQuery !== undefined && (typeof d.photoQuery !== 'string' || d.photoQuery.trim().length < 4)) err(f, 'photoQuery must be a short search string like "1975 Lancia Stratos HF"');
  if (!(Array.isArray(d.photos) && d.photos.length) && !d.photoQuery) warn(f, 'no photos and no photoQuery; the page will have no pictures');

  if (d.sprite) {
    const sp = d.sprite;
    if (sp.w !== 16 || sp.h !== 24) err(f, `sprite must be 16×24, got ${sp.w}×${sp.h}`);
    if (!sp.palette || typeof sp.palette !== 'object') err(f, 'sprite.palette must be an object of char → color');
    if (!Array.isArray(sp.rows)) err(f, 'sprite.rows must be an array of strings');
    else {
      if (sp.rows.length !== sp.h) err(f, `sprite has ${sp.rows.length} rows, expected ${sp.h}`);
      sp.rows.forEach((r, i) => {
        if (typeof r !== 'string' || r.length !== sp.w) err(f, `sprite row ${i} is ${typeof r === 'string' ? r.length : typeof r} chars, expected ${sp.w}`);
        else for (const ch of r) if (ch !== '.' && sp.palette && !(ch in sp.palette)) err(f, `sprite row ${i} uses "${ch}" which is not in palette`);
      });
      const filled = sp.rows.join('').replace(/\./g, '').length;
      if (filled < 120) warn(f, `sprite only has ${filled} filled pixels; it may look like a smudge`);
    }
    if (sp.palette) for (const [k, v] of Object.entries(sp.palette)) if (k.length !== 1 || !(v === 'ACCENT' || v === 'ACCENT_LIGHT' || HEX_COLOR.test(v))) err(f, `palette "${k}": "${v}" must be #rrggbb, ACCENT or ACCENT_LIGHT`);
  }

  if (d.game) {
    const gm = d.game;
    if (gm.obstacle && !OBSTACLES.includes(gm.obstacle)) err(f, `game.obstacle "${gm.obstacle}" not one of ${OBSTACLES.join(', ')}`);
    if (gm.scenery && !SCENERY.includes(gm.scenery)) err(f, `game.scenery "${gm.scenery}" not one of ${SCENERY.join(', ')}`);
    if (gm.weather !== undefined && !WEATHER.includes(gm.weather)) err(f, `game.weather "${gm.weather}" not one of ${WEATHER.join(', ')}`);
    if (gm.laneCount !== undefined && !LANE_COUNTS.includes(gm.laneCount)) err(f, 'game.laneCount must be 2, 3 or 4');
    if (gm.baseSpeed !== undefined && !(gm.baseSpeed >= 0.6 && gm.baseSpeed <= 1.6)) err(f, 'game.baseSpeed must be between 0.6 and 1.6');
    if (gm.curve !== undefined && !(Number.isFinite(gm.curve) && gm.curve >= 0 && gm.curve <= 1)) err(f, 'game.curve must be between 0 and 1');
    if (gm.grip !== undefined && !(Number.isFinite(gm.grip) && gm.grip >= 0 && gm.grip <= 1)) err(f, 'game.grip must be between 0 and 1');
    if (gm.gears !== undefined && !(Number.isInteger(gm.gears) && gm.gears >= 3 && gm.gears <= 8)) err(f, 'game.gears must be a whole number from 3 to 8');
    if (gm.accent && !HEX_COLOR.test(gm.accent)) err(f, 'game.accent must be #rrggbb');
    if (gm.stars && !(Array.isArray(gm.stars) && gm.stars.length === 3 && gm.stars.every((n, i, a) => Number.isFinite(n) && (i === 0 || n > a[i - 1])))) err(f, 'game.stars must be 3 ascending numbers');
  }

  if (Array.isArray(d.sources)) {
    if (!d.sources.length) err(f, 'sources is empty');
    d.sources.forEach((s, i) => { if (!isUrl(s)) err(f, `sources[${i}] must be an http(s) URL`); });
  } else if (d.sources !== undefined) err(f, 'sources must be an array of URLs');
}

// --- day files
const daysDir = path.join(root, 'days');
const dayFiles = readdirSync(daysDir).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse();
for (const n of dayFiles) { const d = readJson(`days/${n}`); if (d) checkDay(`days/${n}`, /** @type {DayFile} */ (d)); }
const template = readJson('days/_template.json');
if (template) checkDay('days/_template.json', /** @type {DayFile} */ (template));

// --- index + latest
const index = readJson('days/index.json');
if (index) {
  if (!Array.isArray(index)) err('days/index.json', 'must be an array');
  else {
    const entries = /** @type {IndexEntry[]} */ (index);
    const dates = entries.map(e => e.date);
    if (dates.join() !== [...dates].sort().reverse().join()) err('days/index.json', 'entries must be newest first');
    if (new Set(dates).size !== dates.length) err('days/index.json', 'duplicate dates');
    const names = entries.map(e => (e.name ?? '').toLowerCase());
    if (new Set(names).size !== names.length) err('days/index.json', 'duplicate car names — each day must be a different car');
    entries.forEach((e, i) => {
      if (!e.date || !e.name || !e.class) err('days/index.json', `entry ${i} needs date, name, class`);
      if (e.date && !existsSync(path.join(daysDir, `${e.date}.json`))) err('days/index.json', `entry ${e.date} has no days/${e.date}.json`);
      else if (e.accent !== undefined) {
        if (typeof e.accent !== 'string' || !HEX_COLOR.test(e.accent)) err('days/index.json', `entry ${e.date}: accent must be #rrggbb`);
        else {
          const day = /** @type {DayFile | null} */ (readJson(`days/${e.date}.json`));
          if (day && day.game?.accent?.toLowerCase() !== e.accent.toLowerCase()) err('days/index.json', `entry ${e.date}: accent ${e.accent} does not match game.accent in days/${e.date}.json`);
        }
      }
    });
    for (const n of dayFiles) if (!dates.includes(n.replace('.json', ''))) err('days/index.json', `missing entry for days/${n}`);
    const latest = readJson('days/latest.json');
    const newest = entries[0];
    if (latest && newest) {
      if (/** @type {DayFile} */ (latest).date !== newest.date) err('days/latest.json', `date ${/** @type {DayFile} */ (latest).date} does not match newest index entry ${newest.date}`);
      const src = readFileSync(path.join(daysDir, `${newest.date}.json`), 'utf8');
      if (JSON.stringify(JSON.parse(src)) !== JSON.stringify(latest)) err('days/latest.json', `content differs from days/${newest.date}.json — copy it again`);
    }
  }
}

// --- syntax (package.json declares "type": "module", so node --check parses the .js files as ESM)
for (const f of [...BROWSER_MODULES, ...SCRIPTS]) {
  const abs = path.join(root, f);
  if (!existsSync(abs)) { err(f, 'missing'); continue; }
  try { execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' }); }
  catch (e) { err(f, `syntax error\n${String(e instanceof Error && 'stderr' in e ? e.stderr : e).trim()}`); }
}

// --- types (tsc over the JSDoc-annotated modules; needs `npm install` once)
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
if (existsSync(tsc)) {
  try { execFileSync(process.execPath, [tsc, '-p', path.join(root, 'jsconfig.json')], { stdio: 'pipe', cwd: root }); }
  catch (e) { err('types', `tsc reported errors\n${String(e instanceof Error && 'stdout' in e ? e.stdout : e).trim()}`); }
} else warn('types', 'typescript is not installed; run `npm install` to enable the type check');

// --- console output is not allowed in page code
for (const f of BROWSER_MODULES) {
  const src = readFileSync(path.join(root, f), 'utf8');
  if (/\bconsole\.\w+\(/.test(src)) err(f, 'console.* call in page code');
  if (!src.startsWith('// @ts-check')) err(f, 'must start with // @ts-check');
}

// --- local references in html
for (const f of ['index.html', 'archive.html']) {
  const html = readFileSync(path.join(root, f), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"#?:]+)"/g)) {
    const ref = m[1];
    if (ref === './' || ref.endsWith('/')) continue;
    if (!existsSync(path.join(root, ref))) err(f, `references missing file "${ref}"`);
  }
}

// --- weight
const total = CORE_FILES.reduce((sum, f) => existsSync(path.join(root, f)) ? sum + statSync(path.join(root, f)).size : sum, 0);
if (total > MAX_CORE_KB * 1024) warn('page', `core files total ${(total / 1024).toFixed(0)} KB; keep the engine lean`);

for (const w of warns) print(`warn  ${w}`);
for (const e of errs) print(`ERROR ${e}`);
print(errs.length ? `\n${errs.length} error(s), ${warns.length} warning(s)` : `ok — ${dayFiles.length} day(s), ${warns.length} warning(s)`);
process.exit(errs.length ? 1 : 0);
