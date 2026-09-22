/* Daytrip — the geometry both halves of the game agree on, in logical pixels:
   the 160×240 buffer, the road inside it, and the row the car sits on. The
   simulation (game.js) and the drawing (render.js) both need these and neither
   may import the other, so they live here on their own. */
export const W = 160, H = 240, ROAD_X = 28, ROAD_W = 104, CAR_Y = 196;
