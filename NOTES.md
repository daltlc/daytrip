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

## 2026-09-15 (second run today) — no new car
- Engine: near-miss bonus. While an obstacle is alongside the car, `update()` tracks the tightest lateral gap; once it is past, a gap of `laneW - 11 - 3` px or less scores a near miss — 5% more distance per chained miss (capped at five, ×1.25), held 2.5 s, with a few sparks off the car and a live multiplier beside the distance in the HUD. Sparks and multiplier clear on a crash; sparks are skipped under `prefers-reduced-motion`.
  - The "within ~2 px" from the old next-up list is unreachable and had to be rethought: the lane-change lerp covers ~5 px per frame where it matters, so the tightest pass that does not crash is ~6.7 px, and a fixed 2 px threshold fired zero times in 8 bot-played runs in Chromium. Making it lane-relative instead gives a window of ~80–120 ms per obstacle that holds across 2/3/4 lanes and 66–320 px/s, and never fires on simply holding a lane (that always leaves exactly `laneW - 11` px).
  - Also fixed while in there: the crash path used to `break` out of the collision loop and then immediately call `sound.engine(..., true)`, re-raising the engine hum that `crash()` had just faded out. It returns now.
  - Verified in Chromium with Playwright: page renders clean (only the sandbox's blocked Commons request, which `app.js` already handles), the bonus fires and shows in the HUD during aggressive play, never fires while holding a lane, and leaves nothing on screen after a crash.
- Content: none. The scheduled run fired twice on the same UTC date and `days/2026-09-15.json` was already built ten hours earlier (Audi Sport quattro S1 E2). A second car today could only go in by overwriting that file — which the hard rules forbid and `check.mjs` rejects as a duplicate date — or by dating it 2026-09-16, which would push every later run permanently a day ahead. Skipping the car keeps the cadence: tomorrow's run finds 2026-09-16 free and builds it normally.
- Next up:
  1. Gentle road curvature on a slow sine wave so long runs feel less static (offset ROAD_X per row, keep collision in lane space).
  2. Weather per scenery: rain streaks on `coast`, drifting flakes on `snow`, dust on `desert`. Respect `prefers-reduced-motion`.
  3. Show the near-miss count on the crash card ("4 near misses, best chain ×1.20") so the bonus is discoverable — right now you only see it mid-run.
