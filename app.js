// @ts-check
/* Daytrip engine — no runtime dependencies, no build step.
   Loads days/latest.json (or ?d=YYYY-MM-DD), renders the page, reads it aloud, and runs a tiny
   top-down lane-dodge game with the day's pixel sprite. Modules: dom.js and storage.js
   (helpers), page.js (the page and the read-aloud), game.js (simulation and input),
   render.js (drawing), geom.js (shared numbers), types.js (JSDoc types). Served over http. */
import { boot } from './page.js';

boot();
