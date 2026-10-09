# The game

A top-down lane dodge at 160×240 logical pixels, scaled up with no smoothing. The car sits near the bottom, the road scrolls down, obstacles appear in lanes. Tap the left or right half of the canvas (or swipe, or arrow keys) to change lanes. One hit ends the run. Score is distance in meters. Speed ramps with distance. Three star thresholds give the run a goal.

## `game` block in the day file

```json
"game": {
  "obstacle": "tire",       // cone | barrel | tire | rock | snow | crate | puddle
  "scenery": "track",       // city | mountain | desert | coast | forest | track | snow
  "accent": "#f26b1d",      // page + sprite accent, #rrggbb
  "laneCount": 3,           // optional, 2–4, default 3
  "baseSpeed": 1.0,         // optional, 0.6–1.6 multiplier, default 1
  "maxSpeed": 1.0,          // optional multiplier on the speed cap, default 1
  "curve": 0.6,             // optional, 0–1 road curvature, default 0.6 (0 = dead straight)
  "grip": 0.5,              // optional, 0–1 lane-change bite, default 0.5 (0 = slides, 1 = snaps)
  "gears": 5,               // optional, whole number 3–8, default 5: a shift blip every 1000/gears m
  "weather": "auto",        // optional, auto | none | rain | snow | dust, default auto
  "stars": [300, 800, 1500] // optional, meters for 1/2/3 stars
}
```

Pick these to match the car's world: a Le Mans car gets `tire` + `track`; a Group B rally car `rock` + `forest` or `snow` + `snow`; a JDM street car `cone` + `city`; a desert racer `barrel` + `desert`; a coastal GT `puddle` + `coast`. Make an exotic slightly faster (`baseSpeed` 1.15) and a vintage car slower (`0.8`) with more forgiving stars.

Use `grip` for how the car changes lanes: a rally car on gravel around `0.2`, a road car or a GT at the default `0.5`, a prototype `0.8`, a formula car `1`.

## Where the code lives

ES modules, no build step, JSDoc-typed and checked by TypeScript. `index.html` loads `app.js` with `type="module"`, so the
page has to be served over http (`python3 -m http.server`), not opened as a `file://` path.

- `app.js` — the entry point. Imports `boot` and calls it. Nothing else.
- `types.js` — the JSDoc types every module shares (`DayFile`, `GameParams`, `Obstacle`, …). Add a day-file field here first.
- `dom.js` / `storage.js` — `el`, `must`, `ctx2d`, `present` and the localStorage wrappers that never throw.
- `garage.js` — the archive page list.
- `page.js` — the day page: `loadDay`, `splitSentences`, `render`, `carCard`, the Commons photo lookup, `Speaker`, `showError`.
- `game.js` — the simulation: `Game` as state, input, `spawn()` and `update()`.
- `sound.js` — `Sound`, the WebAudio hum, shift blip and crash burst. It reads no game state; `Game` owns one and calls in.
- `render.js` — the drawing: pixel art, obstacles, scenery, weather, road curvature, `draw(game)`.
- `geom.js` — `W`, `H`, `ROAD_X`, `ROAD_W`, `CAR_Y`. Both halves need them and neither may import the other.
- `dom.js` — the two helpers (`$`, `el`) both halves use.

Everything in `render.js` takes the game and reads it; `update()` never calls into it, so
nothing drawn can move the car or end a run. The arrow only points one way —
`game.js` → `render.js` → `geom.js`, and `game.js` → `sound.js` — so there is no import cycle to trip over.

## Where things live

- `OBSTACLES` (render.js) — 12×12 pixel drawings per obstacle type. Add a type here **and** to `scripts/check.mjs` and this doc.
- `SCENERY` (render.js) — ground color, far-layer color, and an `items(g, x, y, k)` painter for the side strips. Same rule for new types.
- `Game.spawn()` — spacing and lane logic. Spacing is a *time* gap (1.15 s early, easing to 0.6 s by ~1,400 m) multiplied by the current speed, so rows stay reactable as the ramp bites. It guarantees at least one open lane and keeps the open lane adjacent to the previous one when spawning multi-obstacle rows.
- Lane-change grip (`game.js`) — `game.grip` (0–1, optional) is the rate of the lane lerp in `update()`, mapped onto `GRIP_MIN`–`GRIP_MAX` (9–27). 0.5 lands on `GRIP_DEFAULT`, the fixed 18 every day before 2026-09-26 ran, and a day without the field gets that exact number, so no old day's handling moves. Low grip lets the nose slide across the lane; high grip snaps it over. It is clamped to 0–1 and anything that is not a finite number falls back to the default. The near-miss threshold stays lane-relative rather than a fixed pixel gap (see above): grip only changes how long the car spends inside the window, not how wide it is.
- Slide on a low-grip day (`game.js` → `stepSlide`, drawn in render.js) — below grip 0.5 the drawn car carries a little momentum. An underdamped spring (`SLIDE_OMEGA` 18 rad/s, `SLIDE_ZETA` 0.3) chases `carX`, and only the part that swings *past* the car in the direction of the last lane change is kept, as `game.slide`: scaled by `1 − 2 × grip` and capped at `SLIDE_MAX` (4 px). The lag on the way out is never drawn, so the picture never trails its hit box. It is drawing only: collision, near misses, the ghost trace and lane centres all read `carX`, and the ghost is drawn without it. Grip 0.5 and up, a day without the field, and `prefers-reduced-motion` all get exactly 0. The spring steps at most `MAX_DT` at a time so a huge frame cannot blow it up. At grip 0.2 the nose passes the lane by about 4 px and settles; at 0.4 by about 1.6 px. No new field: it reads `grip`.
- `Game.update()` — speed ramp (`baseSpeed + dist * 0.13`, capped), collision (AABB with a small inset), near misses, HUD updates. With the defaults (`baseSpeed` 66 px/s, stars 300/800/1500) a run hits one star at ~45 s, two at ~91 s, three at ~2:12.
- Near misses — while an obstacle is alongside the car, `update()` keeps the tightest lateral gap between the two boxes; once the obstacle is fully past, a gap of `laneW - 11 - NEAR_MISS_SLACK` px or less scores one. Simply sitting in the next lane leaves exactly `laneW - 11` px, so the bonus only lands if you were still crossing lanes as it went by — a window of roughly 80–120 ms per obstacle at any speed or lane count. Each one adds 5% to the metres you earn (capped at five, ×1.25), holds for 2.5 s, and throws a few sparks off the car (skipped under `prefers-reduced-motion`). The live multiplier sits next to the distance in the HUD and clears on a crash. The crash card reports the run's tally ("4 near misses · best chain ×1.20") — `misses` and `bestCombo` are counted per run in `reset()`/`nearMiss()` and survive `clearCombo()`, which both the chain expiring and the crash itself call. A run with none says nothing.
- Road curvature (render.js) — `bend(game, y)` shifts a row sideways on one slow sine wave (13 px of swing at `curve: 1`, wavelength 760 px). The shift is a function of `y - scroll`, so a road feature carries its own offset as it scrolls past and the car and an obstacle at the same `y` always move together. It is drawn on and nothing else: `update()` never calls it, so collision, lane centres and near misses all stay in unbent lane space. The road and its edge lines are painted row by row when the curve is on and as three tall rects when it is off. `prefers-reduced-motion` forces it to 0.
- Ghost of the day's best run — a run samples the car's x every 2 m of distance into `trace` (capped at 1,600 samples, i.e. 3,200 m), and a run that beats the day's best saves that trace to `daytrip.ghost.<date>` alongside the best metres in `daytrip.best.<date>`. The two are written together in `crash()`, so the ghost always belongs to the run that set the number. A later run draws a faint car (`GHOST_ALPHA`) at `ghostX(dist)`, the best run's position *at the same metre mark*, interpolated between the two nearest samples: level with you means you are level with your best. Distance, not time, is the index — the near-miss multiplier makes the two disagree, and metres are what the score, the stars and the best are all counted in. It is drawn under the car and only while running, in the same bend as the car; `update()` never reads it, so it cannot be hit. Past the end of the best run there is nothing to draw, which is the moment you are ahead. `loadGhost()` drops anything that is not a list of two or more finite numbers, so a corrupt or hand-edited key cannot break the run racing it, and a day with no stored ghost (every day before this one) simply has none. The idle card names it once a ghost exists. The crash card says "New best today" only when the run beat the best from before it: `crash()` decides that once (`m > best`, so a tie is not a new best) and passes it to `showCrash(newBest)`; otherwise it shows "Best today: N m".
- Weather (render.js) — `WEATHER` holds three particle kinds and `SCENERY_WEATHER` maps `coast` → `rain`, `snow` → `snow`, `desert` → `dust`. Every other scenery is dry. A day can override with `game.weather`: `auto` (the default) means "whatever the scenery says", `none` turns it off, or name a kind for a dry coast or a snowy mountain pass. Each particle carries its own fall speed plus a share (`tow`) of the current road speed, so rain leans hard into a fast run while snow hangs almost still, and `drift`/`wobble` blow it sideways. It is drawn last, over the car, and `update()` never touches it — nothing here can be hit. `prefers-reduced-motion` drops the layer entirely. Add a kind here **and** to `scripts/check.mjs` and this doc.
- `draw(game)` (render.js) — everything renders to the 160×240 buffer, then the buffer is blitted to the display canvas at an integer scale. It reads the game and paints; it never writes to anything the simulation reads back.
- `buildSprite` / `usableSprite` (render.js) — `buildSprite(day.sprite, accent)` is the only way a day's pixel art becomes a canvas, and it starts by running its argument through `usableSprite`, which swaps in `DEFAULT_SPRITE` for anything missing, zero-sized or row-less. That guard is deliberately inside `buildSprite` rather than at its call sites: a 0×0 sprite makes a 0×0 canvas, which throws at the `drawImage` that follows — in the render loop, in the game's case — and the two call sites used to carry different versions of the check. A row that is not a string draws nothing instead of throwing. `scripts/check.mjs` rejects any sprite that is not 16×24, so no real day file reaches the fallback; it is there for a hand-edited or half-written one.
- Garage swatches (`garage.js`) — each archive row shows a 12 px dot in the day's accent, read from the optional `accent` on its `days/index.json` entry so the garage stays one fetch. Missing or malformed → an empty ring, and the grid column is always there so rows line up. `scripts/check.mjs` requires it to be #rrggbb and to match the day file's `game.accent`.
- Garage class filter (`garage.js` → `filters`) — a row of chips above the list: "all" plus every class that appears in `days/index.json`, in order of first appearance, each with its count ("rally · 2"; "all" counts every day). Tapping a chip shows only that class; tapping it again (or "all") shows everything. The choice is mirrored in `?class=` with `history.replaceState`, so a filtered garage can be linked, and an unknown or missing value shows everything. No new field: it reads `class`, which every entry already has. A garage with a single class gets no bar.
- Garage count line (`garage.js` → `countLine`) — the line under the Garage heading (`#count` in archive.html, `aria-live="polite"`) says how many cars there are ("26 cars so far, newest first.") and, while a filter is on, how many it shows ("2 of 26 cars · rally, newest first."). `show()` rewrites it with the list, so it follows a chip tap and a linked `?class=`. The chips keep their counts; the line is what gives the total its place in the heading. It reads `#count` optionally, so a page without the element still lists every car.
- The car card (`carCard` in page.js) — the day's `sprite` drawn again at 6× (a 96×144 canvas shown at 96 CSS px, `image-rendering: pixelated`) at the top of the game card, over a radial accent glow. It calls the same `buildSprite` the game does, so there is one drawing of the car and no new day-file field, and the fallback above covers a sprite it cannot use. The try/catch around it stays as the backstop: a card that cannot be drawn at all is left out rather than taking the page down. The canvas carries `role="img"` and an `aria-label` naming the car, since the picture is the content. On a phone in landscape (`orientation: landscape` and at most 500 px tall) a media query in `style.css` shows the same canvas at 64 CSS px — 4× — with a smaller glow and less padding, so the card stops pushing the game below the fold; 4 CSS px per sprite pixel keeps every pixel whole at any integer device-pixel ratio.
- Favicon (`index.html`, `archive.html`) — a 16×16 inline SVG data URI (an orange top-down car with four wheels and a blue windscreen on the page background), so there is no icon file to fetch and no 404 on load. Both pages carry the same `<link rel="icon">`; change one, change both.
- `Sound` (sound.js) — WebAudio engine hum (two oscillators through a lowpass), a noise burst on crash, and an upshift blip. Unlocked on first tap. Mute persists in `localStorage`.
- Gear shifts (`game.js`) — `update()` blips once every `shiftStep` metres of distance (200 by default), so the hum has landmarks instead of being one continuous slide. `this.gear` is the number of shifts made this run, zeroed in `reset()` so the first one lands at 200 m rather than on the line; it is set to the step the run is *at* rather than incremented, so a single long frame that crosses several steps blips once instead of firing a burst. Metres rather than seconds on purpose: metres are what the speed ramp, the stars, the best and the ghost are all counted in, and distance accrues faster as the ramp bites, so the shifts close up as you speed up — the shape of a car climbing through its gears. `Sound.shift(rev)` takes the same 0–1 rev figure `engine()` gets and plays a short square note at roughly the engine's own pitch, falling as it fades. It builds its own oscillator and gain rather than bending the engine nodes, because `engine()` re-aims those every frame with `setTargetAtTime` and would wipe any envelope scheduled on them. It is silent when muted, a no-op with no `AudioContext`, and clamps a rev that is not a finite number to 0. Every day gets it. Optional `game.gears` (a whole number, 3–8) sets how many shifts fit in `SHIFT_SPAN` (1,000 m), so the step is `1000 / gears` metres: 5 is the old fixed 200 m and is what a day without the field gets, 8 is a close-ratio racer blipping every 125 m, 3 an old saloon every 333 m. Anything that is not a whole number falls back to 5, and out-of-range numbers are clamped. `gears` also sets how far the blip's pitch falls: by `SHIFT_DROP_K / gears` (2.25 / gears) of itself, so 5 is the old fixed 45% fall, 8 a tight 28% and 3 a long 75% — a close-ratio box sounds tighter, not just busier. `Sound.shift(rev, drop)` clamps the drop to 0.1–0.8 and falls back to 0.45 for anything that is not a finite number.
- Era pitch (`game.js` → `Sound.setPitch`) — a car whose `year` is before `ERA_YEAR` (1930) hums at `ERA_PITCH` (0.7) of the usual pitch, and its shift blip starts from the same lowered note, so a 1920s tourer chugs instead of buzzing. No new field: it reads `year`, which every day has; a day without a finite `year`, or from 1930 on, sounds exactly as before. It keeps the blip rather than switching it off, so the hum still has landmarks. `setPitch` clamps to 0.5–1.5 and falls back to 1 for anything that is not a finite number; `Sound` still reads no game state.
- `Speaker` (in `page.js`) — read-aloud, sentence by sentence, highlighting the current sentence. `splitSentences` feeds it: it breaks on `.`/`!`/`?` only when the break is followed by whitespace and an upper-case letter, digit or opening quote, and never on a decimal point (`1.6-litre`), a single-letter initial (`J. Bugatti`) or a known abbreviation (`St.`, `Dr.`, `e.g.`). Runs of terminators and trailing closing quotes stay with the sentence they end. Joining the pieces always reproduces the input, so nothing can be dropped on the way into the spans.

## Code rules

- Every module starts with `// @ts-check` and is typed with JSDoc. `node scripts/check.mjs` runs `tsc` over all of it and fails on any type error; run `npm install` once to get TypeScript (dev only, nothing ships).
- No `console.*` in page code. The validator rejects it. Errors surface in the UI or are swallowed on purpose with a comment saying why.
- `===` only, `const` by default, named constants instead of magic numbers, private class state behind `#fields`.
- Hot paths (`update()`, `draw()`) allocate nothing per frame: compact arrays in place, touch the DOM only when a displayed value changes.
- No runtime dependencies, no bundler, no framework.

## Improving the engine

One improvement per day, small and finished. Every new day-file field must be optional with a fallback so old days keep working. Run `node scripts/check.mjs` before committing. Keep it dependency-free and keep each module under ~600 lines; if one grows past that, the next improvement is a refactor.

Ideas, roughly in order of payoff:
1. ~~Difficulty curve tuning~~ — done 2026-09-15: one star lands at ~45 s and spacing is time-based.
2. ~~A near-miss bonus~~ — done 2026-09-15: dodging late adds 5% per chained miss and a few sparks. The original "within 2 px" idea is not reachable; the threshold is lane-relative instead, see above.
3. ~~Road curvature~~ — done 2026-09-16: the road slides on a sine wave, drawing only, see above.
4. ~~Weather per scenery~~ — done 2026-09-17: rain, snow and dust, picked from the scenery or set with `game.weather`, see above.
5. ~~Near-miss count on the crash card~~ — done 2026-09-18, see above.
6. ~~Sentence splitter that survives decimals, initials and abbreviations~~ — done 2026-09-19, see `Speaker` above.
7. ~~Ghost of today's best run~~ — done 2026-09-20: a faint car at the best run's position for the metre you are on, see above.
8. ~~Split `app.js`~~ — done 2026-09-21: it passed 600 lines, so it became four modules, see above. Pure code motion; the only edited line made `Game` an export.
9. ~~Split `game.js`~~ — done 2026-09-22: the drawing half moved to `render.js` and the shared geometry to `geom.js`, leaving `Game` as state, input and `update()`. Code motion again, plus the method-to-function call sites.
10. ~~A tiny "car card" render of the sprite above the game with the accent glow~~ — done 2026-09-23, at 6× rather than 4×, see above.
11. ~~A stats grid that survives a narrow phone~~ — done 2026-09-24: `repeat(2, minmax(0, 1fr))` plus `min-width: 0` and `overflow-wrap: anywhere`, so a long value can no longer widen its column and push the page sideways; one column below 360px.
12. ~~One shared guard on the day's `sprite`~~ — done 2026-09-25: `usableSprite` moved into `render.js` and inside `buildSprite`, so the game and the car card cannot disagree about what is drawable, see above.
13. ~~Per-class feel: rally cars slide a little on lane change, F1 cars snap~~ — done 2026-09-26: optional `game.grip`, see above.
14. ~~Sound: a gear-shift blip every 200 m~~ — done 2026-09-27, see the gear-shift bullet above.
15. ~~A smaller car card on a landscape phone~~ — done 2026-09-28: 4× below 500 px of height in landscape, CSS only, see the car card bullet above.
16. ~~Lateral overshoot on low-grip cars~~ — done 2026-09-29: drawing only, see the slide bullet above.
17. ~~Per-car shift interval~~ — done 2026-09-30: optional `game.gears`, see the gear-shift bullet above.
18. ~~Move `Sound` out of `game.js`~~ — done 2026-10-02: it was at 569 lines, so `Sound` and its constants became `sound.js`. Pure code motion; `game.js` is now ~475.
19. ~~Shift-blip pitch that follows `gears`~~ — done 2026-10-03: fewer gears, a longer fall; see the gear-shift bullet above.
20. ~~Filter the garage by class~~ — done 2026-10-04: chips above the list, linkable with `?class=`, see the garage filter bullet above.
21. ~~A count on each garage filter chip~~ — done 2026-10-06: "rally · 2", see the garage filter bullet above.
22. ~~A lower hum for pre-1930 cars~~ — done 2026-10-08: read from `year`, no new field, see the era pitch bullet above.
23. ~~The garage count in the heading~~ — done 2026-10-09: a live count line that also says what a filter is showing, see the garage count bullet above.
