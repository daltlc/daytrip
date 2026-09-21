# Daytrip

One car a day. Read it, hear it, drive it.

Every morning a small page appears with one specific real car: a short story, what it is, the numbers, a few real photos, a button that reads it all aloud, and a tiny pixel game where you drive a low-res version of that car down a road and dodge things. Mobile first, no dependencies, no build.

The daily page is written by a scheduled Claude routine (Opus) that follows `ROUTINE.md`: it picks a car it has not covered, researches it, writes the day file, draws the sprite, makes one small improvement to the engine, validates, and pushes. Each day builds on the last.

- Live: https://daltlc.github.io/daytrip/
- Garage (every past day): https://daltlc.github.io/daytrip/archive.html

## Layout

```
index.html      the page shell
style.css       mobile-first styles
app.js          entry point (ES module)
page.js         the day page: render, photos, read-aloud
game.js         the pixel game: sprites, scenery, weather, sound
dom.js          the two DOM helpers both halves use
archive.html    garage list
days/           one JSON per day, latest.json, index.json
data/           car-pool.json — candidate cars with a hook each
scripts/        check.mjs (validator), commons.mjs (photo finder)
docs/           SCHEMA.md, SPRITES.md, GAME.md
ROUTINE.md      what the daily run does
NOTES.md        build log + next-up list
```

## Run locally

Any static server works, e.g. `python3 -m http.server 8080` then open http://localhost:8080/. The page is ES modules, so it needs a server — opening `index.html` as a `file://` path will not load it. Validate with `node scripts/check.mjs` (Node 18+).
