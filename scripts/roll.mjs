#!/usr/bin/env node
// @ts-check
// Rolls a random search brief for today's car, so the pick is discovered fresh instead of
// taken from a list. Usage: node scripts/roll.mjs   (roll again for a new brief; at most 3 per day)
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @import { CarClass, IndexEntry } from '../types.js' */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECENT_DAYS = 5;
const OFF_PREFERENCE_ODDS = 4; // one roll in four ignores the least-covered weighting
const RELAX_LOOKBACK = 10; // NOTES.md entries to scan for angles, regions and decades that had to be relaxed
const RELAXED_WEIGHT = 1; // a recently relaxed angle's, region's or decade's draw weight, against NORMAL_WEIGHT
const NORMAL_WEIGHT = 3;

/** @type {Record<CarClass, string>} */
const LABEL = {
  road: 'Road car', exotic: 'Exotic / supercar', rally: 'Rally', f1: 'Formula 1 / open-wheel',
  gt3: 'GT racing (GT3, GT1, GTE)', lemans: 'Le Mans / endurance prototype', jdm: 'Japanese domestic market',
  muscle: 'Muscle car', offroad: 'Off-road / desert racing / trucks', vintage: 'Vintage (pre-1970)',
  touring: 'Touring car racing', concept: 'Concept / one-off show car',
};
const CLASSES = /** @type {CarClass[]} */ (Object.keys(LABEL));
const DECADES = ['1920s or earlier', '1930s', '1940s', '1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
// decades a class can't come from (vintage means pre-1970; muscle and GT racing start in the 1950s),
// so the brief never contradicts itself. Indices into DECADES, inclusive.
/** @type {Partial<Record<CarClass, [number, number]>>} */
const DECADE_RANGE = { vintage: [0, 4], muscle: [3, 10], gt3: [3, 10] };
const UNEXPECTED = 'somewhere you would not expect a car company';
const REGIONS = ['Italy', 'Germany', 'Japan', 'United Kingdom', 'France', 'United States', 'Sweden', 'Australia', 'Czechia or Eastern Europe', 'South Korea', 'Spain', 'the Netherlands or Belgium', 'South America', UNEXPECTED];
// classes tied to a place: a JDM car is Japanese by definition, and muscle cars come from the
// American V8 tradition and its offshoots (Holden and Ford Australia, Chevrolet Brazil), so the
// brief never pairs one with a region that wastes a search. Every other class draws from REGIONS.
/** @type {Partial<Record<CarClass, string[]>>} */
const CLASS_REGIONS = { jdm: ['Japan'], muscle: ['United States', 'Australia', 'South America'] };
// regions that built no cars before a given decade (Korea's first car is the 1955 Sibal), so a
// roll never pairs them with a decade that always forces the region to be relaxed. Index into
// DECADES of the first decade the region can be drawn for; a region not listed is always fine.
/** @type {Record<string, number>} */
const REGION_FROM = { 'South Korea': 3 };
// this angle names its own region: it only pairs with UNEXPECTED, and never with a class tied to
// a place (a JDM car from a country not known for cars contradicts itself)
const NOT_KNOWN_FOR_CARS = 'a car built in a country not known for building cars';
const ANGLES = [
  'a homologation special built only to make a race car legal',
  'an underdog that beat the favorites',
  'a one-off or tiny-production car most enthusiasts have never heard of',
  'a record breaker: speed, endurance, sales, or auction price',
  'a commercial flop that became a cult classic',
  'a car defined by one engineer or designer',
  'a car killed or banned by a rulebook change',
  'a car that started or ended a racing era',
  'a car with a strange engine or drivetrain layout',
  'a car famous for a single race, stage, or stunt',
  'a privateer or small team taking on the factories',
  NOT_KNOWN_FOR_CARS,
];

/**
 * @template T
 * @param {readonly T[]} items
 * @returns {T}
 */
const pick = items => items[randomInt(items.length)];

/** @returns {IndexEntry[]} */
function readIndex() {
  try {
    const parsed = JSON.parse(readFileSync(path.join(root, 'days/index.json'), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/** @param {string} s */
const norm = s => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/ +/g, ' ').trim();

/**
 * Angles, regions and decades the last few runs had to relax ("the roll was <class> / <decade> /
 * <region> / <angle>." followed by "relaxed the angle" / "relaxed the region" / "relaxed the
 * decade", or "dropped …",
 * on the same Content line of NOTES.md), so impossible pairings come up less. Notes may shorten
 * a hint ("a record breaker"), so either text prefixing the other counts as a match. A missing
 * or odd NOTES.md just means no weighting.
 * @returns {{ angles: Set<string>, regions: Set<string>, decades: Set<string> }}
 */
function recentlyRelaxed() {
  const out = { angles: new Set(/** @type {string[]} */ ([])), regions: new Set(/** @type {string[]} */ ([])), decades: new Set(/** @type {string[]} */ ([])) };
  let notes = '';
  try { notes = readFileSync(path.join(root, 'NOTES.md'), 'utf8'); } catch { return out; }
  /** @param {readonly string[]} list @param {string} said */
  const find = (list, said) => list.find(a => norm(a).startsWith(said) || said.startsWith(norm(a)));
  const entries = notes.split(/\n## /).slice(1).slice(-RELAX_LOOKBACK);
  for (const entry of entries) {
    const content = entry.split('\n').find(l => l.startsWith('- Content:')) ?? '';
    const roll = /the roll was [^/]+\/ ([^/]+?) \/ ([^/]+?) \/ ([^.]+)\./.exec(content);
    if (!roll) continue;
    const angle = /\b(relax(ed)?|dropp?(ed)?) the angle\b/.test(content) ? find(ANGLES, norm(roll[3])) : undefined;
    const region = /\b(relax(ed)?|dropp?(ed)?) the region\b/.test(content) ? find(REGIONS, norm(roll[2])) : undefined;
    // decades are matched exactly on their digits ("1940s"), since norm() strips digits
    const decade = /\b(relax(ed)?|dropp?(ed)?) the decade\b/.test(content)
      ? DECADES.find(d => d.slice(0, 5) === roll[1].trim().slice(0, 5)) : undefined;
    if (angle) out.angles.add(angle);
    if (region) out.regions.add(region);
    if (decade) out.decades.add(decade);
  }
  return out;
}

/**
 * @param {readonly string[]} items
 * @param {Set<string>} down items drawn at RELAXED_WEIGHT instead of NORMAL_WEIGHT (relaxed recently)
 * @returns {string}
 */
function pickWeighted(items, down) {
  const weights = items.map(a => (down.has(a) ? RELAXED_WEIGHT : NORMAL_WEIGHT));
  let r = randomInt(weights.reduce((t, w) => t + w, 0));
  for (let i = 0; i < items.length; i++) if ((r -= weights[i]) < 0) return items[i];
  return items[items.length - 1];
}

const index = readIndex();
const { angles: relaxed, regions: relaxedRegions, decades: relaxedDecades } = recentlyRelaxed();
const recent = new Set(index.slice(0, RECENT_DAYS).map(e => e.class));
/** @type {Record<CarClass, number>} */
const counts = { road: 0, exotic: 0, rally: 0, f1: 0, gt3: 0, lemans: 0, jdm: 0, muscle: 0, offroad: 0, vintage: 0, touring: 0, concept: 0 };
for (const e of index) if (e.class in counts) counts[e.class]++;
// classes not used in the last few days, weighted toward the least-covered ones
const eligible = CLASSES.filter(c => !recent.has(c));
const fewest = Math.min(...eligible.map(c => counts[c]));
const preferred = eligible.filter(c => counts[c] === fewest);
const cls = pick(randomInt(OFF_PREFERENCE_ODDS) === 0 ? eligible : preferred);
const [lo, hi] = DECADE_RANGE[cls] ?? [0, DECADES.length - 1];
const decade = pickWeighted(DECADES.slice(lo, hi + 1), relaxedDecades);
const decadeIndex = DECADES.indexOf(decade);
const placeBound = CLASS_REGIONS[cls];
const angle = pickWeighted(placeBound ? ANGLES.filter(a => a !== NOT_KNOWN_FOR_CARS) : ANGLES, relaxed);
const regions = (placeBound ?? REGIONS).filter(r => (REGION_FROM[r] ?? 0) <= decadeIndex);
const region = angle === NOT_KNOWN_FOR_CARS ? UNEXPECTED : pickWeighted(regions.length ? regions : placeBound ?? REGIONS, relaxedRegions);
const label = LABEL[cls].toLowerCase();
// a place-bound class never draws the "country not known for cars" angle; say so on the brief, the
// same way skipped regions are named, so a run knows why that angle never shows for it
const angleSkipped = `"${NOT_KNOWN_FOR_CARS}" skipped for ${cls}, a class tied to a place`;

// the regions REGION_FROM kept out of this roll, named on the brief so a run knows why one never
// shows (only when the region was drawn from the list, not named by the angle)
const skipped = angle === NOT_KNOWN_FOR_CARS ? [] : (placeBound ?? REGIONS)
  .filter(r => (REGION_FROM[r] ?? 0) > decadeIndex)
  .map(r => `${r} skipped before the ${DECADES[REGION_FROM[r]]}`);

/**
 * Which hint to drop first when the class, decade, region and angle rarely meet (Swedish
 * off-roaders, German 1990s rally record-breakers). The class is the hard rule, so it is never
 * relaxed; the angle is the narrowest hint, so it goes first, then the region, then the decade.
 * The "country not known for cars" angle names its own region, so the two go together, and a
 * region a class is tied to (a JDM car is Japanese) or a decade a class is pinned to is kept.
 * @returns {string}
 */
function relaxOrder() {
  /** @type {string[]} */
  const steps = [];
  if (angle === NOT_KNOWN_FOR_CARS) steps.push('the angle and region together');
  else {
    steps.push('the angle');
    if (!placeBound || placeBound.length > 1) steps.push('the region');
  }
  if (hi > lo) steps.push(DECADE_RANGE[cls] ? `the decade (stay within ${DECADES[lo]}–${DECADES[hi]})` : 'the decade');
  return steps.map((s, i) => `${i + 1}. ${s}`).join(', ');
}

process.stdout.write([
  `Class:   ${cls} (${LABEL[cls]})  <- hard rule`,
  `Recent:  ${index.slice(0, RECENT_DAYS).map(e => e.class).join(', ') || 'none'}  <- the last ${RECENT_DAYS} days, newest first; never reuse these`,
  `Counts:  ${CLASSES.map(c => `${c} ${counts[c]}`).join(', ')}  <- days per class; rolls favour the fewest${recent.size ? ' (recent ones excluded)' : ''}`,
  `Decade:  ${decade}  <- strong hint${relaxedDecades.has(decade) ? ' (relaxed recently, so drawn less often)' : ''}`,
  `Region:  ${region}  <- strong hint${relaxedRegions.has(region) ? ' (relaxed recently, so drawn less often)' : ''}${skipped.length ? ` (${skipped.join('; ')})` : ''}`,
  `Angle:   ${angle}  <- strong hint${relaxed.has(angle) ? ' (relaxed recently, so drawn less often)' : ''}${placeBound ? ` (${angleSkipped})` : ''}`,
  `Search:  try phrasings like "${decade} ${region} ${label} ${angle}" and "obscure ${label} ${decade} ${region}"`,
  `Relax:   if nothing real fits, drop hints in this order, keeping the class: ${relaxOrder()}; say which in NOTES.md`,
  `Avoid (already covered): ${index.map(e => `${e.year ?? ''} ${e.name}`.trim()).join('; ') || 'nothing yet'}`,
  `Stats:   two figures with one label? Use "tag" ({"label": "Power", "tag": "race", ...}), not "Power (race)"; see docs/SCHEMA.md`,
  '',
].join('\n'));
