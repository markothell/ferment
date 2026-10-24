// The homepage drawing. One set of eight people moves through six beats beside
// the words: the mark, a story carried along a line, a field of circles, one
// circle, a web of gatherings, and the mark again. Ink and saffron only. Pure,
// so the server and the browser draw the same thing.

export type Pt = [number, number];

export const SIZE = 600;
export const C = 300;
export const PEOPLE = 8;

const round = (n: number) => Math.round(n * 100) / 100;

/** n points on a circle, starting at angle `start`. */
export function ring(cx: number, cy: number, r: number, n: number, start = 0): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = start + (k * Math.PI * 2) / n;
    out.push([round(cx + r * Math.cos(a)), round(cy + r * Math.sin(a))]);
  }
  return out;
}

// Beat 2: a story passed along a line of people.
export const ROW: Pt[] = [[72, 330], [163, 306], [254, 330], [345, 306], [436, 330], [527, 306]];
export const BEADS: Pt[] = ROW.slice(0, -1).map((p, i) => [(p[0] + ROW[i + 1][0]) / 2, (p[1] + ROW[i + 1][1]) / 2]);

// Beat 4: the circle. Beat 5: your gathering, small, in the web.
export const BIG = ring(C, C, 156, 8, -Math.PI / 2);
export const HOME = ring(C, C, 64, 8, -Math.PI / 2);

const NONE: (Pt | null)[] = new Array(PEOPLE).fill(null);

/** Where each person stands in each beat; null means not on the page. */
export const PLACES: Record<number, (Pt | null)[]> = {
  1: NONE,
  2: [ROW[2], ROW[3], ROW[0], ROW[1], ROW[4], ROW[5], null, null],
  3: NONE,
  4: BIG,
  5: HOME,
  6: NONE,
};

// Beat 3: a field of circles, each with its own middle and a few seats. An idea
// spreads from one of them: a fill that reaches its neighbours, fainter with
// each step, in waves. `spread` is how much fill a circle gets, `wave` when.
export type FieldCircle = { at: Pt; seats: Pt[]; spread: number; wave: number };
const ORIGIN = [1, 2];
const SPREAD = [0.5, 0.3, 0.18, 0.1, 0.05, 0.03];
export const FIELD: FieldCircle[] = [];
for (let y = 0; y < 5; y++) {
  for (let x = 0; x < 5; x++) {
    const at: Pt = [120 + x * 90, 120 + y * 90];
    const steps = Math.abs(x - ORIGIN[0]) + Math.abs(y - ORIGIN[1]);
    FIELD.push({ at, seats: ring(at[0], at[1], 30, 5 + ((x + y) % 3), (Math.PI / 5) * (x + 1)), spread: SPREAD[Math.min(steps, SPREAD.length - 1)], wave: steps });
  }
}
export const FIELD_R = 30;
/** Milliseconds between waves of the spread. */
export const WAVE_MS = 320;

// Beat 5: the web. Other gatherings around yours, each holding circles, joined
// to their neighbours as well as to you. Two threads leave the page.
export type Gathering = { at: Pt; r: number; circles: Pt[]; circleR: number };
const OTHER_RINGS: [number, number, number][] = [[118, 128, 52], [472, 112, 56], [526, 338, 50], [416, 508, 54], [160, 486, 50], [72, 314, 46]];
export const OTHERS: Gathering[] = OTHER_RINGS.map(([x, y, r], k) => ({
  at: [x, y], r, circleR: round(r * 0.3),
  circles: ring(x, y, r * 0.55, 3, Math.PI / 2 + k),
}));
export const JOINS: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 4]];
export const LEAVES: [Pt, Pt][] = [[[472, 112], [640, 20]], [[160, 486], [-40, 590]]];
/** Where the question is, on its way from your gathering to a neighbour. */
export const TRAVELLER: Pt = [472, 112];

// Where to start: the two small drawings beside the invitations (viewBox 200).
export const UNIT = 200;
export const UNIT_SEATS = ring(100, 100, 72, 8, -Math.PI / 2);
export type SmallCircle = { at: Pt; r: number; seats: Pt[] };
export const UNIT_CIRCLES: SmallCircle[] = ([[62, 72, 27], [142, 66, 25], [104, 146, 27]] as [number, number, number][]).map(([x, y, r], j) => ({
  at: [x, y], r, seats: ring(x, y, r, 5 + j, Math.PI / 4),
}));
export const UNIT_LOOSE: Pt[] = [[36, 128], [164, 124], [150, 160], [30, 100]];
