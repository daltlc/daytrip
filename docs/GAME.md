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
  "stars": [300, 800, 1500] // optional, meters for 1/2/3 stars
}
```

Pick these to match the car's world: a Le Mans car gets `tire` + `track`; a Group B rally car `rock` + `forest` or `snow` + `snow`; a JDM street car `cone` + `city`; a desert racer `barrel` + `desert`; a coastal GT `puddle` + `coast`. Make an exotic slightly faster (`baseSpeed` 1.15) and a vintage car slower (`0.8`) with more forgiving stars.

## Where things live in `app.js`

- `OBSTACLES` — 12×12 pixel drawings per obstacle type. Add a type here **and** to `scripts/check.mjs` and this doc.
- `SCENERY` — ground color, far-layer color, and an `items(g, x, y, k)` painter for the side strips. Same rule for new types.
- `Game.spawn()` — spacing and lane logic. Spacing is a *time* gap (1.15 s early, easing to 0.6 s by ~1,400 m) multiplied by the current speed, so rows stay reactable as the ramp bites. It guarantees at least one open lane and keeps the open lane adjacent to the previous one when spawning multi-obstacle rows.
- `Game.update()` — speed ramp (`baseSpeed + dist * 0.13`, capped), collision (AABB with a small inset), HUD updates. With the defaults (`baseSpeed` 66 px/s, stars 300/800/1500) a run hits one star at ~45 s, two at ~91 s, three at ~2:12.
- `Game.draw()` — everything renders to the 160×240 buffer, then the buffer is blitted to the display canvas at an integer scale.
- `Sound` — WebAudio engine hum (two oscillators through a lowpass) and a noise burst on crash. Unlocked on first tap. Mute persists in `localStorage`.
- `Speaker` — read-aloud, sentence by sentence, highlighting the current sentence.

## Improving the engine

One improvement per day, small and finished. Every new day-file field must be optional with a fallback so old days keep working. Run `node scripts/check.mjs` before committing. Keep it dependency-free and under ~600 lines; if it grows past that, the next improvement is a refactor.

Ideas, roughly in order of payoff:
1. ~~Difficulty curve tuning~~ — done 2026-09-15: one star lands at ~45 s and spacing is time-based.
2. A near-miss bonus: passing an obstacle within 2 px adds a small multiplier and a spark.
3. Road curvature: gently offset the road on a sine wave so long runs feel less static.
4. Weather per scenery (rain streaks on `coast`, snowflakes on `snow`).
5. Ghost of today's best run.
6. A tiny "car card" render of the sprite at 4× above the game with the accent glow.
7. Per-class feel: rally cars slide a little on lane change, F1 cars snap.
8. Sound: a gear-shift blip every 200 m.
