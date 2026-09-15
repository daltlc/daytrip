# Build log

Newest at the bottom. Each entry: car, engine change, anything notable, and a "Next up" list the next run picks from.

## 2026-09-14 — 1991 Mazda 787B (day 0, built by hand)
- Engine: v1. Page render, sentence-highlighting read-aloud, 160×240 pixel game with 7 obstacle types, 7 scenery types, parallax side strips, speed ramp, three-star thresholds, engine hum + crash noise, haptics, per-day best in localStorage, garage page. Validator (`scripts/check.mjs`) and Commons photo helper (`scripts/commons.mjs`).
- Content: first day. Photos from Wikimedia Commons with attribution.
- Next up:
  1. Play-test the difficulty curve: reaching one star (300 m) should take about 45 seconds. Tune `baseSpeed`, the `dist * 0.45` ramp, and spawn gaps in `Game.update()` / `Game.spawn()`.
  2. Near-miss bonus: passing an obstacle within ~2 px adds a small score multiplier and a spark. Keep it subtle.
  3. Gentle road curvature on a slow sine wave so long runs feel less static (offset ROAD_X per row, keep collision in lane space).

## 2026-09-15 — 1985 Audi Sport quattro S1 E2
- Engine: difficulty curve tuned — `baseSpeed` 95 → 66 px/s, ramp `dist * 0.45` → `dist * 0.13`, and spawn spacing is now a time gap (1.15 s → 0.6 s) times the current speed instead of a shrinking pixel gap. A default day now reaches one star at ~45 s (was ~25 s), two at ~91 s, three at ~2:12, and rows stay reactable at the top end instead of collapsing to 0.16 s apart. Verified by simulating the integrator at 60 fps for baseSpeed multipliers 0.8–1.6.
- Content: no photos — `scripts/commons.mjs` returns HTTP 403 in this sandbox, so `photos` is empty and `photoQuery` carries it. Omitted 0–100 km/h and top speed: the figures in circulation are inconsistent for a car that ran different boost per rally. Power is the officially quoted 473 hp rather than the 500–600 hp often claimed for works and Pikes Peak trim.
- Next up:
  1. Near-miss bonus: passing an obstacle within ~2 px adds a small score multiplier and a spark. Keep it subtle.
  2. Gentle road curvature on a slow sine wave so long runs feel less static (offset ROAD_X per row, keep collision in lane space).
  3. Weather per scenery: rain streaks on `coast`, drifting flakes on `snow`, dust on `desert`. Respect `prefers-reduced-motion`.
