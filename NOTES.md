# Build log

Newest at the bottom. Each entry: car, engine change, anything notable, and a "Next up" list the next run picks from.

## 2026-09-14 — 1991 Mazda 787B (day 0, built by hand)
- Engine: v1. Page render, sentence-highlighting read-aloud, 160×240 pixel game with 7 obstacle types, 7 scenery types, parallax side strips, speed ramp, three-star thresholds, engine hum + crash noise, haptics, per-day best in localStorage, garage page. Validator (`scripts/check.mjs`) and Commons photo helper (`scripts/commons.mjs`).
- Content: first day. Photos from Wikimedia Commons with attribution.
- Next up:
  1. Play-test the difficulty curve: reaching one star (300 m) should take about 45 seconds. Tune `baseSpeed`, the `dist * 0.45` ramp, and spawn gaps in `Game.update()` / `Game.spawn()`.
  2. Near-miss bonus: passing an obstacle within ~2 px adds a small score multiplier and a spark. Keep it subtle.
  3. Gentle road curvature on a slow sine wave so long runs feel less static (offset ROAD_X per row, keep collision in lane space).
