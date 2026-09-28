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

/** @type {Record<CarClass, string>} */
const LABEL = {
  road: 'Road car', exotic: 'Exotic / supercar', rally: 'Rally', f1: 'Formula 1 / open-wheel',
  gt3: 'GT racing (GT3, GT1, GTE)', lemans: 'Le Mans / endurance prototype', jdm: 'Japanese domestic market',
  muscle: 'Muscle car', offroad: 'Off-road / desert racing / trucks', vintage: 'Vintage (pre-1970)',
  touring: 'Touring car racing', concept: 'Concept / one-off show car',
};
const CLASSES = /** @type {CarClass[]} */ (Object.keys(LABEL));
const DECADES = ['1920s or earlier', '1930s', '1940s', '1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
const REGIONS = ['Italy', 'Germany', 'Japan', 'United Kingdom', 'France', 'United States', 'Sweden', 'Australia', 'Czechia or Eastern Europe', 'South Korea', 'Spain', 'the Netherlands or Belgium', 'South America', 'somewhere you would not expect a car company'];
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
  'a car built in a country not known for building cars',
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

const index = readIndex();
const recent = new Set(index.slice(0, RECENT_DAYS).map(e => e.class));
/** @type {Record<CarClass, number>} */
const counts = { road: 0, exotic: 0, rally: 0, f1: 0, gt3: 0, lemans: 0, jdm: 0, muscle: 0, offroad: 0, vintage: 0, touring: 0, concept: 0 };
for (const e of index) if (e.class in counts) counts[e.class]++;
// classes not used in the last few days, weighted toward the least-covered ones
const eligible = CLASSES.filter(c => !recent.has(c));
const fewest = Math.min(...eligible.map(c => counts[c]));
const preferred = eligible.filter(c => counts[c] === fewest);
const cls = pick(randomInt(OFF_PREFERENCE_ODDS) === 0 ? eligible : preferred);
const decade = pick(DECADES), region = pick(REGIONS), angle = pick(ANGLES);
const label = LABEL[cls].toLowerCase();

process.stdout.write([
  `Class:   ${cls} (${LABEL[cls]})  <- hard rule`,
  `Decade:  ${decade}  <- strong hint`,
  `Region:  ${region}  <- strong hint`,
  `Angle:   ${angle}  <- strong hint`,
  `Search:  try phrasings like "${decade} ${region} ${label} ${angle}" and "obscure ${label} ${decade} ${region}"`,
  `Avoid (already covered): ${index.map(e => `${e.year ?? ''} ${e.name}`.trim()).join('; ') || 'nothing yet'}`,
  '',
].join('\n'));
