// @ts-check
/* Daytrip — sentence splitting, shared by the page (read-aloud highlighting) and
   scripts/check.mjs (the one-sentence hook warning). No DOM, so Node can import it too. */
// A full stop only ends a sentence if what follows looks like a new one. Guards, in order: a
// decimal point ("3.3-litre"), a single-letter initial ("J. Bugatti"), a known abbreviation
// ("St. Moritz"), no whitespace after, or a lower-case word next. Everything else splits.
const ABBREV = /(?:^|[\s("'‘“])(?:mr|mrs|ms|dr|prof|rev|st|mt|sr|jr|vs|etc|no|fig|approx|dept|vol|co|inc|ltd|ave|rd|e\.g|i\.e|a\.m|p\.m|u\.s|u\.k)\.$/i;
const INITIAL = /(?:^|[\s("'‘“])[A-Z]\.$/;
const SENTENCE_START = /[A-Z0-9"'(‘“]/;
const TERMINATORS = '.!?';
const CLOSERS = '"\')]’”';

/** @param {string | undefined} ch */
const isDigit = ch => ch !== undefined && ch >= '0' && ch <= '9';

/**
 * @param {string | undefined} raw
 * @returns {string[]}
 */
export function splitSentences(raw) {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  /** @type {string[]} */
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!TERMINATORS.includes(c)) continue;
    if (c === '.' && isDigit(text[i - 1]) && isDigit(text[i + 1])) continue;
    let j = i; // "?!" and closing quotes ride along
    while (j + 1 < text.length && TERMINATORS.includes(text[j + 1])) j++;
    while (j + 1 < text.length && CLOSERS.includes(text[j + 1])) j++;
    const rest = text.slice(j + 1);
    const next = rest.charAt(1);
    const endsSentence = rest === '' || (rest.charAt(0) === ' ' && (next === '' || SENTENCE_START.test(next)));
    const head = text.slice(start, i + 1);
    const abbreviation = c === '.' && (INITIAL.test(head) || ABBREV.test(head));
    if (endsSentence && !abbreviation) {
      out.push(text.slice(start, j + 1).trim());
      start = j + 1;
    }
    i = j;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}
