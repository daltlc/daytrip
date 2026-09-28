// @ts-check
/* Daytrip — the geometry both halves of the game agree on, in logical pixels: the 160×240
   buffer, the road inside it, and the row the car sits on. game.js and render.js both need
   these and neither may import the other, so they live here on their own. */
export const W = 160;
export const H = 240;
export const ROAD_X = 28;
export const ROAD_W = 104;
export const CAR_Y = 196;
