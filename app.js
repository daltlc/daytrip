/* Daytrip engine v1 — no dependencies, no build step.
   Loads days/latest.json (or ?d=YYYY-MM-DD), renders the page, reads it aloud,
   and runs a tiny top-down lane-dodge game with the day's pixel sprite.
   Three modules behind this entry point: dom.js (helpers), page.js (the page
   and the read-aloud), game.js (the engine). Served over http, not file://. */
import { boot } from './page.js';

boot();
