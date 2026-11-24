#!/usr/bin/env node
// @ts-check
// Prints the photos the page would show for a car, as ready-to-paste `photos` entries.
// Usage: node scripts/commons.mjs "<maker> <model>" [count] [--wiki "<Wikipedia article title>"]
// Runs photos.js, the same code the page uses, so what it prints is what the page shows.
// Prints [] if nothing qualifies (or if Wikimedia is unreachable from this machine).
import { findPhotos } from '../photos.js';

const USER_AGENT = 'daytrip/1.0 (https://github.com/daltlc/daytrip; personal daily car page)';
const args = process.argv.slice(2);
const wikiAt = args.indexOf('--wiki');
const wikiTitle = wikiAt >= 0 ? args.splice(wikiAt, 2)[1] : undefined;
const [query, countArg] = args;
if (!query && !wikiTitle) {
  process.stderr.write('usage: node scripts/commons.mjs "<maker> <model>" [count] [--wiki "<article title>"]\n');
  process.exit(2);
}
const want = Math.max(1, Math.min(6, Number(countArg) || 3));
const photos = await findPhotos({ query, wikiTitle, want, headers: { 'User-Agent': USER_AGENT } })
  .catch((/** @type {unknown} */ e) => { process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`); return []; });
process.stdout.write(`${JSON.stringify(photos, null, 2)}\n`);
