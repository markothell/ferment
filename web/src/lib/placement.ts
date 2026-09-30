// Shared geometry for placing yourself on a line or in a square: the answer
// input and the results chart draw the same frame, so a dot means the same
// thing in both. Positions are 0..1 on each axis; poleA is at 0.

export const LINE = { w: 320, h: 56, pad: 20 };
export const SQUARE = { s: 300, pad: 18 };

export function lineX(x: number) {
  return LINE.pad + x * (LINE.w - 2 * LINE.pad);
}
export function squareXY(x: number, y: number) {
  const span = SQUARE.s - 2 * SQUARE.pad;
  return { cx: SQUARE.pad + x * span, cy: SQUARE.pad + y * span };
}

/** In "four corners" mode a position snaps to the middle of its quadrant. */
export function snapQuadrant(v: number) {
  return v < 0.5 ? 0.25 : 0.75;
}

export const q2 = (v: number) => Math.round(v * 100) / 100;
