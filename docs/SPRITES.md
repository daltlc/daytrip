# Drawing the car sprite

Every day file carries a `sprite`: a 16 wide × 24 tall pixel grid, top-down view, **nose pointing up**. The game scales it up with pixel snapping, so keep shapes chunky and symmetrical. It should read as *this* car in one glance: proportions, livery colors, wing or no wing, open wheels or enclosed.

```json
"sprite": {
  "w": 16, "h": 24,
  "palette": { "o": "#f26b1d", "g": "#2e8b3a", "k": "#111318", "w": "#f2f2f2", "b": "#8fd3ff", "r": "#ff3b3b" },
  "rows": [ "................", ... 24 strings of exactly 16 chars ... ]
}
```

- `.` is transparent. Every other character must exist in `palette`.
- Colors are `#rrggbb`. Two magic values: `ACCENT` (the day's `game.accent`) and `ACCENT_LIGHT` (a lighter tint of it) so a sprite can reuse the accent.
- Aim for 130–260 filled pixels. Wheels are `k` (near-black) and stick out past the body on road cars, are enclosed on prototypes, and are fully exposed on open-wheel cars.
- Rows 0–2 nose, 3–6 front wheels, 7–10 windshield/cockpit, 11–14 roof or engine cover, 15–18 rear wheels, 19–21 tail (lights), 22–23 wing or empty.
- Glass: a light blue (`b`). Tail lights: two red pixels at the rear corners. A stripe or number roundel of contrasting color makes liveries pop.

## Reference shapes

Hot hatch / road car (wheels poke out, boxy roof):
```
......kkkk......
....aaaaaaaa....
...aaaaaaaaaa...
.kkaaaaaaaaaakk.
.kkaaaaaaaaaakk.
..aaaaaaaaaaaa..
..aabbbbbbbbaa..
..abbbbbbbbbba..
..abbbbbbbbbba..
..aakkkkkkkkaa..
..aakkkkkkkkaa..
..aakkkkkkkkaa..
..aakkkkkkkkaa..
..aabbbbbbbbaa..
..aabbbbbbbbaa..
.kkaaaaaaaaaakk.
.kkaaaaaaaaaakk.
..aaaaaaaaaaaa..
..arraaaaaarra..
..aaaaaaaaaaaa..
...kkkkkkkkkk...
................
................
................
```

Open-wheel (F1): narrow tub, exposed wheels, wide wings front and rear:
```
kkkkkkkkkkkkkkkk
.k............k.
......aaaa......
.kk...aaaa...kk.
.kk..aaaaaa..kk.
.kk..aaaaaa..kk.
.....aaaaaa.....
.....aabbaa.....
.....abbbba.....
.....akkkka.....
.....aakkaa.....
....aaaaaaaa....
....aaaaaaaa....
...aaaaaaaaaa...
.kk.aaaaaaaa.kk.
.kk.aaaaaaaa.kk.
.kk.aaaaaaaa.kk.
.kk..aaaaaa..kk.
.....aaaaaa.....
......arra......
.kkkkkkkkkkkkkk.
kkkkkkkkkkkkkkkk
.k............k.
................
```

Le Mans prototype / GT: wide, low, enclosed wheels, full-width rear wing:
```
.....aaaaaa.....
....aaaaaaaa....
...aaaaaaaaaa...
.kkaaaaaaaaaakk.
.kkaaaaaaaaaakk.
.kkaaaaaaaaaakk.
..aaaaaaaaaaaa..
..aaabbbbbbaaa..
..aabbbbbbbbaa..
..aabkkkkkkbaa..
..aaaakkkkaaaa..
..aaaaaaaaaaaa..
..aaaaaaaaaaaa..
..aaaaaaaaaaaa..
..aaaaaaaaaaaa..
.kkaaaaaaaaaakk.
.kkaaaaaaaaaakk.
.kkaaaaaaaaaakk.
..aaaaaaaaaaaa..
..arraaaaaarra..
..aaaaaaaaaaaa..
.kkkkkkkkkkkkkk.
kkkkkkkkkkkkkkkk
.k............k.
```

Rally car: hatch shape plus a roof scoop, mud-flaps and rally lights on the nose (four light pixels across rows 1–2). Truck / off-roader: taller (use all 24 rows), wheels 3 wide, a bed or spare tire at the back.

Sanity check before you ship: paste the rows into a monospace editor and squint. If the silhouette does not say "car", widen the body and darken the wheels.
