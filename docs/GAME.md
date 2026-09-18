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
  "weather": "auto",        // optional, auto | none | rain | snow | dust, default auto
  "stars": [300, 800, 1500] // optional, meters for 1/2/3 stars
}
```

Pick these to match the car's world: a Le Mans car gets `tire` + `track`; a Group B rally car `rock` + `forest` or `snow` + `snow`; a JDM street car `cone` + `city`; a desert racer `barrel` + `desert`; a coastal GT `puddle` + `coast`. Make an exotic slightly faster (`baseSpeed` 1.15) and a vintage car slower (`0.8`) with more forgiving stars.

## Where things live in `app.js`

- `OBSTACLES` — 12×12 pixel drawings per obstacle type. Add a type here **and** to `scripts/check.mjs` and this doc.
- `SCENERY` — ground color, far-layer color, and an `items(g, x, y, k)` painter for the side strips. Same rule for new types.
- `Game.spawn()` — spacing and lane logic. Spacing is a *time* gap (1.15 s early, easing to 0.6 s by ~1,400 m) multiplied by the current speed, so rows stay reactable as the ramp bites. It guarantees at least one open lane and keeps the open lane adjacent to the previous one when spawning multi-obstacle rows.
- `Game.update()` — speed ramp (`baseSpeed + dist * 0.13`, capped), collision (AABB with a small inset), near misses, HUD updates. With the defaults (`baseSpeed` 66 px/s, stars 300/800/1500) a run hits one star at ~45 s, two at ~91 s, three at ~2:12.
- Near misses — while an obstacle is alongside the car, `update()` keeps the tightest lateral gap between the two boxes; once the obstacle is fully past, a gap of `laneW - 11 - NEAR_MISS_SLACK` px or less scores one. Simply sitting in the next lane leaves exactly `laneW - 11` px, so the bonus only lands if you were still crossing lanes as it went by — a window of roughly 80–120 ms per obstacle at any speed or lane count. Each one adds 5% to the metres you earn (capped at five, ×1.25), holds for 2.5 s, and throws a few sparks off the car (skipped under `prefers-reduced-motion`). The live multiplier sits next to the distance in the HUD and clears on a crash. The crash card reports the run's tally ("4 near misses · best chain ×1.20") — `misses` and `bestCombo` are counted per run in `reset()`/`nearMiss()` and survive `clearCombo()`, which both the chain expiring and the crash itself call. A run with none says nothing.
- Road curvature — `bend(y)` shifts a row sideways on one slow sine wave (13 px of swing at `curve: 1`, wavelength 760 px). The shift is a function of `y - scroll`, so a road feature carries its own offset as it scrolls past and the car and an obstacle at the same `y` always move together. It is drawn on and nothing else: `update()` never calls it, so collision, lane centres and near misses all stay in unbent lane space. The road and its edge lines are painted row by row when the curve is on and as three tall rects when it is off. `prefers-reduced-motion` forces it to 0.
- Weather — `WEATHER` holds three particle kinds and `SCENERY_WEATHER` maps `coast` → `rain`, `snow` → `snow`, `desert` → `dust`. Every other scenery is dry. A day can override with `game.weather`: `auto` (the default) means "whatever the scenery says", `none` turns it off, or name a kind for a dry coast or a snowy mountain pass. Each particle carries its own fall speed plus a share (`tow`) of the current road speed, so rain leans hard into a fast run while snow hangs almost still, and `drift`/`wobble` blow it sideways. It is drawn last, over the car, and `update()` never touches it — nothing here can be hit. `prefers-reduced-motion` drops the layer entirely. Add a kind here **and** to `scripts/check.mjs` and this doc.
- `Game.draw()` — everything renders to the 160×240 buffer, then the buffer is blitted to the display canvas at an integer scale.
- `Sound` — WebAudio engine hum (two oscillators through a lowpass) and a noise burst on crash. Unlocked on first tap. Mute persists in `localStorage`.
- `Speaker` — read-aloud, sentence by sentence, highlighting the current sentence.

## Improving the engine

One improvement per day, small and finished. Every new day-file field must be optional with a fallback so old days keep working. Run `node scripts/check.mjs` before committing. Keep it dependency-free and under ~600 lines; if it grows past that, the next improvement is a refactor.

Ideas, roughly in order of payoff:
1. ~~Difficulty curve tuning~~ — done 2026-09-15: one star lands at ~45 s and spacing is time-based.
2. ~~A near-miss bonus~~ — done 2026-09-15: dodging late adds 5% per chained miss and a few sparks. The original "within 2 px" idea is not reachable; the threshold is lane-relative instead, see above.
3. ~~Road curvature~~ — done 2026-09-16: the road slides on a sine wave, drawing only, see above.
4. ~~Weather per scenery~~ — done 2026-09-17: rain, snow and dust, picked from the scenery or set with `game.weather`, see above.
5. ~~Near-miss count on the crash card~~ — done 2026-09-18, see above.
6. Ghost of today's best run.
7. A tiny "car card" render of the sprite at 4× above the game with the accent glow.
8. Per-class feel: rally cars slide a little on lane change, F1 cars snap.
9. Sound: a gear-shift blip every 200 m.
