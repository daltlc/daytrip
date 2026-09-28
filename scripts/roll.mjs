#!/usr/bin/env node
// Rolls a random search brief for today's car, so the pick is discovered fresh instead of taken from a list.
// Usage: node scripts/roll.mjs        (run again for a different roll; at most 3 rolls per day)
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = { road: 'Road car', exotic: 'Exotic / supercar', rally: 'Rally', f1: 'Formula 1 / open-wheel', gt3: 'GT racing (GT3, GT1, GTE)', lemans: 'Le Mans / endurance prototype', jdm: 'Japanese domestic market', muscle: 'Muscle car', offroad: 'Off-road / desert racing / trucks', vintage: 'Vintage (pre-1970)', touring: 'Touring car racing', concept: 'Concept / one-off show car' };
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
const pick = a => a[randomInt(a.length)];

let index = [];
try { index = JSON.parse(readFileSync(path.join(root, 'days/index.json'), 'utf8')); } catch {}
const recent = new Set(index.slice(0, 5).map(e => e.class));
const counts = Object.fromEntries(Object.keys(LABEL).map(c => [c, 0]));
for (const e of index) if (e.class in counts) counts[e.class]++;
// classes not used in the last 5 days, weighted toward the least-covered ones
const eligible = Object.keys(LABEL).filter(c => !recent.has(c));
const min = Math.min(...eligible.map(c => counts[c]));
const preferred = eligible.filter(c => counts[c] === min);
const cls = pick(randomInt(4) === 0 ? eligible : preferred);
const decade = pick(DECADES), region = pick(REGIONS), angle = pick(ANGLES);

console.log(`Class:   ${cls} (${LABEL[cls]})  <- hard rule`);
console.log(`Decade:  ${decade}  <- strong hint`);
console.log(`Region:  ${region}  <- strong hint`);
console.log(`Angle:   ${angle}  <- strong hint`);
console.log(`Search:  try phrasings like "${decade} ${region} ${LABEL[cls].toLowerCase()} ${angle}" and "obscure ${LABEL[cls].toLowerCase()} ${decade} ${region}"`);
console.log(`Avoid (already covered): ${index.map(e => `${e.year} ${e.name}`).join('; ') || 'nothing yet'}`);
