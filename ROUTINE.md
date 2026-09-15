# Daytrip — the daily run

You are building today's Daytrip: one real car, a short story, numbers, photos, a pixel sprite, and one small engine improvement. Work in this repo. Everything you need is here. Finish in one pass and push.

## 0. Orient
- `git pull --ff-only`.
- Get today's date in Pacific time: `TZ=America/Los_Angeles date +%F` (the file name and `date` field use this). If `days/<date>.json` already exists, skip steps 1–3 and only do the engine improvement.
- Read `NOTES.md` (the last entry and its "Next up" list), `days/index.json`, `docs/SCHEMA.md`, `docs/SPRITES.md`, `docs/GAME.md`. Skim `app.js`.

## 1. Pick the car
- Look at the last 5 entries in `days/index.json`. Pick a `class` that is not among them.
- Pick one specific, real, well-documented car in that class that is **not** already in `days/index.json` (compare names loosely; a different generation of the same model is fine only if it has its own story). `data/car-pool.json` has candidates with a hook each; you may go off-list. Mix eras and countries over time. Be specific: "1999 Nissan Skyline GT-R V-Spec (R34)", not "a Skyline".

## 2. Research
- Use WebSearch and WebFetch. Two to four solid sources (manufacturer heritage pages, Wikipedia, reputable motoring press, museum pages).
- Collect: one angle for the story, the plain description, 5–7 stats with units, and the source URLs.
- Never invent a number. If a stat is disputed or missing, leave it out.
- Network in this sandbox: WebSearch works. WebFetch to Wikipedia, Wikimedia Commons and most motoring sites is blocked by the egress proxy. Do not probe, inspect or work around the proxy; search-result snippets plus manufacturer pages that do load are enough.
- Photos: set `"photoQuery": "<year> <maker> <model>"` and `"photos": []`. The page fetches and attributes Commons photos itself when viewed. Only fill `photos` by hand if `node scripts/commons.mjs "<query>" 3` actually returns entries.

## 3. Write `days/YYYY-MM-DD.json`
- Follow `docs/SCHEMA.md` exactly. Voice: a warm, curious guide talking to a friend on a morning drive. Short sentences (it is read aloud). Second person is fine. No filler, no "in conclusion".
- `hook`: one sentence, the most surprising true thing.
- `story`: 120–180 words, one angle.
- `description`: 60–90 words.
- Draw the `sprite` per `docs/SPRITES.md`. Match the real livery or a famous color.
- Set `game.obstacle`, `game.scenery`, `game.accent` to match the car's world (see `docs/GAME.md`).
- Copy the file to `days/latest.json` (exact copy). Prepend `{date, name, year, class}` to `days/index.json`.
- Content rule: no game franchise names, characters or events. The validator rejects them.

## 4. Improve the engine (one thing)
- Choose the top item from the last "Next up" list in `NOTES.md`, or fix a bug you noticed reading `app.js`. One improvement, finished and small. Do not start a rewrite.
- Any new day-file field must be optional with a fallback. Old days must still render.
- If you touch obstacle or scenery types, update `scripts/check.mjs` and `docs/GAME.md` too.

## 5. Check
- `node scripts/check.mjs` must print `ok`. Fix everything it reports.

## 6. Log
- Append to `NOTES.md`:
  ```
  ## YYYY-MM-DD — <year> <car>
  - Engine: <what you changed, one line>
  - Content: <anything notable: no photos found, stat omitted, etc.>
  - Next up:
    1. ...
    2. ...
    3. ...
  ```

## 7. Ship
- `git add -A && git commit -m "day N: <year> <car>" && git push origin main` where N is the number of entries in `days/index.json`.
- Do not open pull requests or branches. If the push is rejected, retry once, then stop and report the error verbatim in your final message. Do not push through any other tool or API, do not export patches, do not force.

## Hard rules
- No dependencies, no build step, no frameworks. Plain HTML, CSS, JS.
- Core page weight (html + css + js + latest.json) under 400 KB; photos are hotlinked from Wikimedia Commons only.
- The whole page should be readable in under two minutes.
- Do not change the `days/` schema in a breaking way. Do not delete or rewrite past day files.
