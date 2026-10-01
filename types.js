// @ts-check
/* Daytrip — shared JSDoc types. No runtime code; import with `@import` in a JSDoc comment. */

/** @typedef {'road' | 'exotic' | 'rally' | 'f1' | 'gt3' | 'lemans' | 'jdm' | 'muscle' | 'offroad' | 'vintage' | 'touring' | 'concept'} CarClass */
/** @typedef {'cone' | 'barrel' | 'tire' | 'rock' | 'snow' | 'crate' | 'puddle'} ObstacleKind */
/** @typedef {'city' | 'mountain' | 'desert' | 'coast' | 'forest' | 'track' | 'snow'} SceneryKind */
/** @typedef {'rain' | 'snow' | 'dust'} WeatherKind */

/** @typedef {{ label: string, value: string }} Stat */
/** @typedef {{ url: string, thumb?: string, credit?: string, license?: string, source?: string, alt?: string }} Photo */
/** @typedef {{ w: number, h: number, palette: Record<string, string>, rows: string[] }} Sprite */

/**
 * @typedef {object} GameParams
 * @property {ObstacleKind} [obstacle]
 * @property {SceneryKind} [scenery]
 * @property {string} [accent] `#rrggbb`
 * @property {number} [laneCount] 2–4
 * @property {number} [baseSpeed] multiplier, 0.6–1.6
 * @property {number} [maxSpeed] multiplier on the speed cap
 * @property {[number, number, number]} [stars] metres for one, two and three stars
 * @property {number} [curve] 0–1, how far the road swings
 * @property {number} [grip] 0–1, how sharply the car changes lanes
 * @property {number} [gears] 3–8, how often the engine blips a shift (default 5, every 200 m)
 * @property {'auto' | 'none' | WeatherKind} [weather]
 */

/**
 * @typedef {object} DayFile
 * @property {string} date YYYY-MM-DD
 * @property {string} name
 * @property {number} [year]
 * @property {string} [maker]
 * @property {string} [country]
 * @property {CarClass} [class]
 * @property {string} [hook]
 * @property {string} [story]
 * @property {string} [description]
 * @property {Stat[]} [stats]
 * @property {Photo[]} [photos]
 * @property {string} [photoQuery]
 * @property {Sprite} [sprite]
 * @property {GameParams} [game]
 * @property {string[]} [sources]
 */

/** @typedef {{ date: string, name: string, year?: number, class: CarClass, accent?: string }} IndexEntry */

/** @typedef {{ lane: number, y: number, gap: number, passed: boolean }} Obstacle */
/** @typedef {{ x: number, y: number, vx: number, vy: number, t: number }} Spark */
/** @typedef {{ x: number, y: number, s: number, ph: number }} Drop */
/** @typedef {(g: CanvasRenderingContext2D, x: number, y: number, k: number) => void} ScenePainter */
/** @typedef {{ ground: string, far: string, items: ScenePainter }} Scenery */
/** @typedef {{ count: number, fall: number, tow: number, drift: number, len: number, wobble: number, color: string }} Weather */

export {};
