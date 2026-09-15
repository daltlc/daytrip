# Day file schema — `days/YYYY-MM-DD.json`

One file per day. `days/latest.json` is an exact copy of the newest file. `days/index.json` lists every day, newest first. `node scripts/check.mjs` enforces all of this.

| Field | Type | Required | Notes |
|---|---|---|---|
| `date` | `"YYYY-MM-DD"` | yes | Must match the filename. |
| `name` | string | yes | Model name without the year, e.g. `"Mazda 787B"`, `"Lancia Delta S4"`. Specific trim/chassis when it matters: `"Skyline GT-R V-Spec (R34)"`. |
| `year` | integer | yes | Model year or the year of the famous version. |
| `maker` | string | yes | `"Mazda"`, `"Lancia"`. |
| `country` | string | no | `"Japan"`. Shown after the maker. |
| `class` | enum | yes | `road` `exotic` `rally` `f1` `gt3` `lemans` `jdm` `muscle` `offroad` `vintage` `touring` `concept` |
| `hook` | string | yes | One sentence shown under the name and spoken first. The single most surprising fact. |
| `story` | string | yes | 120–180 words. One angle only: a race, a designer, a scandal, a record, a rivalry. Second person is fine ("you"). Short sentences, since it is read aloud. |
| `description` | string | yes | 60–90 words. What it is, who built it, why it matters. Plain and factual. |
| `stats` | `[{label, value}]` | yes | 5–7 items, both strings. Only stats you found in a source. Omit rather than guess. Suggested labels: `Engine`, `Power`, `Torque`, `0–60 mph`, `Top speed`, `Weight`, `Drivetrain`, `Built`. Values include units: `"700 hp @ 9,000 rpm"`, `"830 kg"`. |
| `photos` | `[{url, thumb, credit, license, source, alt}]` | no | 0–3. Get them with `node scripts/commons.mjs "<car>" 3`. Page renders fine with none. Never hotlink from anywhere but Wikimedia Commons. |
| `photoQuery` | string | no | `"<year> <maker> <model>"`, e.g. `"1975 Lancia Stratos HF"`. When `photos` is empty, the page searches Wikimedia Commons for this at view time (same filters as `scripts/commons.mjs`: free licenses only, title must mention the car, attribution shown). **Always set this**; the cloud sandbox cannot reach Commons, so this is how photos get on the page. |
| `sprite` | `{w:16, h:24, palette, rows}` | yes | See `docs/SPRITES.md`. |
| `game` | object | yes | See `docs/GAME.md`. `obstacle`, `scenery`, `accent` are the ones to set every day. |
| `sources` | `[url]` | yes | 2–4 pages the facts came from. Shown in the footer. |

Rules:
- No game franchise names, characters, or festivals anywhere. The validator rejects them.
- Content stands alone: someone who has never played a racing game should enjoy it.
- Do not add new top-level fields without also handling them (with a fallback) in `app.js` and documenting them here.
