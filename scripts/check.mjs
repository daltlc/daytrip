#!/usr/bin/env node
// Validates every day file, index/latest consistency, app.js syntax, and local asset references.
// Usage: node scripts/check.mjs   (exit 1 on any error)
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errs = [], warns = [];
const CLASSES = ['road', 'exotic', 'rally', 'f1', 'gt3', 'lemans', 'jdm', 'muscle', 'offroad', 'vintage', 'touring', 'concept'];
const OBSTACLES = ['cone', 'barrel', 'tire', 'rock', 'snow', 'crate', 'puddle'];
const SCENERY = ['city', 'mountain', 'desert', 'coast', 'forest', 'track', 'snow'];
const WEATHER = ['auto', 'none', 'rain', 'snow', 'dust'];
const BANNED = /\b(forza|horizon festival|playground games|gran turismo|need for speed)\b/i;
const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const isUrl = u => /^https?:\/\/\S+$/.test(String(u || ''));
const err = (f, m) => errs.push(`${f}: ${m}`);
const warn = (f, m) => warns.push(`${f}: ${m}`);

function readJson(rel) {
  try { return JSON.parse(readFileSync(path.join(root, rel), 'utf8')); }
  catch (e) { err(rel, `invalid JSON — ${e.message}`); return null; }
}

function checkDay(f, d) {
  for (const k of ['date', 'name', 'year', 'maker', 'class', 'hook', 'story', 'description', 'stats', 'sprite', 'game', 'sources'])
    if (d[k] == null) err(f, `missing "${k}"`);
  if (d.date && !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) err(f, `date must be YYYY-MM-DD, got "${d.date}"`);
  if (d.date && !f.includes('_template') && !f.endsWith('latest.json') && path.basename(f) !== `${d.date}.json`) err(f, `filename does not match date "${d.date}"`);
  if (d.year && !(Number.isInteger(d.year) && d.year > 1880 && d.year < 2100)) err(f, `year must be an integer, got ${JSON.stringify(d.year)}`);
  if (d.class && !CLASSES.includes(d.class)) err(f, `class "${d.class}" not one of ${CLASSES.join(', ')}`);
  if (d.hook && words(d.hook) > 30) warn(f, `hook is ${words(d.hook)} words; keep it to one sentence`);
  const sw = words(d.story); if (d.story && (sw < 100 || sw > 220)) err(f, `story is ${sw} words; target 120–180`);
  const dw = words(d.description); if (d.description && (dw < 40 || dw > 120)) err(f, `description is ${dw} words; target 60–90`);
  for (const k of ['hook', 'story', 'description']) if (BANNED.test(d[k] || '')) err(f, `"${k}" mentions a game franchise; content must stand on its own`);
  if (Array.isArray(d.stats)) {
    if (d.stats.length < 3 || d.stats.length > 8) err(f, `stats has ${d.stats.length} items; target 5–7`);
    d.stats.forEach((s, i) => { if (!s || typeof s.label !== 'string' || typeof s.value !== 'string' || !s.label || !s.value) err(f, `stats[${i}] needs string label and value`); });
  } else if (d.stats != null) err(f, 'stats must be an array');
  if (d.photos != null) {
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
  if (d.photoQuery != null && (typeof d.photoQuery !== 'string' || d.photoQuery.trim().length < 4)) err(f, 'photoQuery must be a short search string like "1975 Lancia Stratos HF"');
  if (!(Array.isArray(d.photos) && d.photos.length) && !d.photoQuery) warn(f, 'no photos and no photoQuery; the page will have no pictures');
  if (d.sprite) {
    const sp = d.sprite;
    if (sp.w !== 16 || sp.h !== 24) err(f, `sprite must be 16×24, got ${sp.w}×${sp.h}`);
    if (!sp.palette || typeof sp.palette !== 'object') err(f, 'sprite.palette must be an object of char → color');
    if (!Array.isArray(sp.rows)) err(f, 'sprite.rows must be an array of strings');
    else {
      if (sp.rows.length !== sp.h) err(f, `sprite has ${sp.rows.length} rows, expected ${sp.h}`);
      sp.rows.forEach((r, i) => {
        if (typeof r !== 'string' || r.length !== sp.w) err(f, `sprite row ${i} is ${r?.length} chars, expected ${sp.w}`);
        else for (const ch of r) if (ch !== '.' && sp.palette && !(ch in sp.palette)) err(f, `sprite row ${i} uses "${ch}" which is not in palette`);
      });
      const filled = (sp.rows || []).join('').replace(/\./g, '').length;
      if (filled < 120) warn(f, `sprite only has ${filled} filled pixels; it may look like a smudge`);
    }
    if (sp.palette) for (const [k, v] of Object.entries(sp.palette)) if (k.length !== 1 || !(v === 'ACCENT' || v === 'ACCENT_LIGHT' || /^#[0-9a-f]{6}$/i.test(v))) err(f, `palette "${k}": "${v}" must be #rrggbb, ACCENT or ACCENT_LIGHT`);
  }
  if (d.game) {
    const gm = d.game;
    if (gm.obstacle && !OBSTACLES.includes(gm.obstacle)) err(f, `game.obstacle "${gm.obstacle}" not one of ${OBSTACLES.join(', ')}`);
    if (gm.scenery && !SCENERY.includes(gm.scenery)) err(f, `game.scenery "${gm.scenery}" not one of ${SCENERY.join(', ')}`);
    if (gm.weather != null && !WEATHER.includes(gm.weather)) err(f, `game.weather "${gm.weather}" not one of ${WEATHER.join(', ')}`);
    if (gm.laneCount != null && ![2, 3, 4].includes(gm.laneCount)) err(f, 'game.laneCount must be 2, 3 or 4');
    if (gm.baseSpeed != null && !(gm.baseSpeed >= 0.6 && gm.baseSpeed <= 1.6)) err(f, 'game.baseSpeed must be between 0.6 and 1.6');
    if (gm.curve != null && !(Number.isFinite(gm.curve) && gm.curve >= 0 && gm.curve <= 1)) err(f, 'game.curve must be between 0 and 1');
    if (gm.grip != null && !(Number.isFinite(gm.grip) && gm.grip >= 0 && gm.grip <= 1)) err(f, 'game.grip must be between 0 and 1');
    if (gm.accent && !/^#[0-9a-f]{6}$/i.test(gm.accent)) err(f, 'game.accent must be #rrggbb');
    if (gm.stars && !(Array.isArray(gm.stars) && gm.stars.length === 3 && gm.stars.every((n, i, a) => Number.isFinite(n) && (i === 0 || n > a[i - 1])))) err(f, 'game.stars must be 3 ascending numbers');
  }
  if (Array.isArray(d.sources)) { if (!d.sources.length) err(f, 'sources is empty'); d.sources.forEach((s, i) => { if (!isUrl(s)) err(f, `sources[${i}] must be an http(s) URL`); }); }
  else if (d.sources != null) err(f, 'sources must be an array of URLs');
}

// --- day files
const daysDir = path.join(root, 'days');
const dayFiles = readdirSync(daysDir).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse();
for (const n of dayFiles) { const d = readJson(`days/${n}`); if (d) checkDay(`days/${n}`, d); }
const tpl = readJson('days/_template.json'); if (tpl) checkDay('days/_template.json', tpl);

// --- index + latest
const index = readJson('days/index.json');
if (index) {
  if (!Array.isArray(index)) err('days/index.json', 'must be an array');
  else {
    const dates = index.map(e => e.date);
    if (dates.join() !== [...dates].sort().reverse().join()) err('days/index.json', 'entries must be newest first');
    if (new Set(dates).size !== dates.length) err('days/index.json', 'duplicate dates');
    const names = index.map(e => (e.name || '').toLowerCase()); if (new Set(names).size !== names.length) err('days/index.json', 'duplicate car names — each day must be a different car');
    index.forEach((e, i) => {
      if (!e.date || !e.name || !e.class) err('days/index.json', `entry ${i} needs date, name, class`);
      if (e.date && !existsSync(path.join(daysDir, `${e.date}.json`))) err('days/index.json', `entry ${e.date} has no days/${e.date}.json`);
    });
    for (const n of dayFiles) if (!dates.includes(n.replace('.json', ''))) err('days/index.json', `missing entry for days/${n}`);
    const latest = readJson('days/latest.json');
    if (latest && index[0] && latest.date !== index[0].date) err('days/latest.json', `date ${latest.date} does not match newest index entry ${index[0].date}`);
    if (latest && index[0]) {
      const src = readFileSync(path.join(daysDir, `${index[0].date}.json`), 'utf8');
      if (JSON.stringify(JSON.parse(src)) !== JSON.stringify(latest)) err('days/latest.json', `content differs from days/${index[0].date}.json — copy it again`);
    }
  }
}

// --- engine syntax
// The browser files are ES modules with a .js extension, which only older Node parses as
// CommonJS; checking a temp .mjs copy instead means `import` is never a false error here.
const BROWSER_MODULES = new Set(['app.js', 'dom.js', 'geom.js', 'page.js', 'render.js', 'game.js']);
const tmp = mkdtempSync(path.join(tmpdir(), 'daytrip-'));
for (const f of [...BROWSER_MODULES, 'scripts/check.mjs', 'scripts/commons.mjs']) {
  const abs = path.join(root, f);
  if (!existsSync(abs)) { err(f, 'missing'); continue; }
  let target = abs;
  if (BROWSER_MODULES.has(f)) { target = path.join(tmp, `${path.basename(f, '.js')}.mjs`); copyFileSync(abs, target); }
  try { execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' }); }
  catch (e) { err(f, `syntax error\n${String(e.stderr || e.message).trim().replaceAll(target, abs)}`); }
}
rmSync(tmp, { recursive: true, force: true });

// --- local references in html
for (const f of ['index.html', 'archive.html']) {
  const html = readFileSync(path.join(root, f), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"#?:]+)"/g)) {
    const ref = m[1]; if (ref === './' || ref.endsWith('/')) continue;
    if (!existsSync(path.join(root, ref))) err(f, `references missing file "${ref}"`);
  }
}

// --- weight
let total = 0; for (const f of ['index.html', 'style.css', 'app.js', 'dom.js', 'geom.js', 'page.js', 'render.js', 'game.js', 'days/latest.json']) if (existsSync(path.join(root, f))) total += statSync(path.join(root, f)).size;
if (total > 400 * 1024) warn('page', `core files total ${(total / 1024).toFixed(0)} KB; keep the engine lean`);

for (const w of warns) console.log(`warn  ${w}`);
for (const e of errs) console.log(`ERROR ${e}`);
console.log(errs.length ? `\n${errs.length} error(s), ${warns.length} warning(s)` : `ok — ${dayFiles.length} day(s), ${warns.length} warning(s)`);
process.exit(errs.length ? 1 : 0);
