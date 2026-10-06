// The homepage drawing, "how it grows" (design/ferment/archive/home.html).
// One set of people moves through five arrangements: invited one by one, on the
// community ring, gathered in circles, sharing to the middle, and the community
// as one ring among others. Ink and saffron only. Pure, so the server and the
// browser draw the same thing.

export type Pt = [number, number];
export type GrowPerson = { invitedBy: number; invited: Pt; ring: Pt; circle: Pt };
export type GrowCircle = { name: string; at: Pt; r: number };
export type GrowTopic = { label: string; at: Pt; library: boolean };
export type OtherCommunity = { at: Pt; r: number; circles: Pt[]; seat: number };

export const SIZE = 600;
export const CENTER = 300;
export const RING = 220;

const round = (n: number) => Math.round(n * 100) / 100;
const pol = (r: number, a: number): Pt => [round(CENTER + r * Math.cos(a)), round(CENTER + r * Math.sin(a))];
const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const dist = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// Who invited whom: one person, then each generation invites the next.
const GENERATIONS = [5, 12, 17];
const INVITE_RADII = [0, 78, 160, 217];

const CIRCLES: { name: string; at: Pt; seats: number }[] = [
  { name: "The early years", at: [212, 222], seats: 6 },
  { name: "Money, honestly", at: [392, 222], seats: 5 },
  { name: "Grief", at: [228, 392], seats: 4 },
  { name: "The garden", at: [380, 386], seats: 6 },
];

export const TOPICS: GrowTopic[] = [
  { label: "the early years", at: [208, 205], library: false },
  { label: "money", at: [392, 200], library: false },
  { label: "grief", at: [232, 300], library: false },
  { label: "the garden", at: [380, 380], library: false },
  { label: "What fed you this week?", at: [300, 252], library: true },
  { label: "Who do you call when it's hard?", at: [300, 412], library: true },
];

export function growScene() {
  const gen: number[] = [0];
  const angle: number[] = [-Math.PI / 2];
  const invitedBy: number[] = [-1];
  GENERATIONS.forEach((n, g) => {
    const parents = gen.map((x, i) => (x === g ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + ((k + 0.5) / n) * Math.PI * 2 + g * 0.12;
      const parent = g === 0 ? 0 : parents.reduce((best, i) => (turn(angle[i], a) < turn(angle[best], a) ? i : best), parents[0]);
      gen.push(g + 1); angle.push(a); invitedBy.push(parent);
    }
  });
  const count = gen.length;
  const invited = gen.map((g, i): Pt => (g === 0 ? [CENTER, CENTER] : pol(INVITE_RADII[g], angle[i])));

  // On the ring, in the same order they sat around the first person.
  const norm = (a: number) => (a + Math.PI * 2.5) % (Math.PI * 2);
  const order = gen.map((_, i) => i).sort((i, j) => norm(i === 0 ? angle[i] - 0.01 : angle[i]) - norm(j === 0 ? angle[j] - 0.01 : angle[j]));
  const ring: Pt[] = new Array(count);
  order.forEach((p, k) => { ring[p] = pol(RING, -Math.PI / 2 + (k / count) * Math.PI * 2); });

  // Each circle takes the people nearest it on the ring; the rest stay where they are.
  const circle: Pt[] = ring.slice();
  const taken = new Set<number>();
  const circles: GrowCircle[] = CIRCLES.map(({ name, at, seats }) => {
    const r = 26 + seats * 3;
    const near = ring.map((_, i) => i).filter((i) => !taken.has(i))
      .sort((i, j) => dist(ring[i], at) - dist(ring[j], at)).slice(0, seats)
      .sort((i, j) => Math.atan2(ring[i][1] - at[1], ring[i][0] - at[0]) - Math.atan2(ring[j][1] - at[1], ring[j][0] - at[0]));
    const start = Math.atan2(ring[near[0]][1] - at[1], ring[near[0]][0] - at[0]);
    near.forEach((p, k) => {
      taken.add(p);
      const a = start + (k / near.length) * Math.PI * 2;
      circle[p] = [round(at[0] + r * Math.cos(a)), round(at[1] + r * Math.sin(a))];
    });
    return { name, at, r };
  });

  const people: GrowPerson[] = gen.map((_, i) => ({ invitedBy: invitedBy[i], invited: invited[i], ring: ring[i], circle: circle[i] }));

  // Other communities, around this one once it has shrunk.
  const others: OtherCommunity[] = [[-95, 190, 0.8], [-25, 225, 0.62], [40, 200, 0.74], [110, 215, 0.62], [170, 200, 0.7], [230, 225, 0.6]]
    .map(([deg, d, s], k) => {
      const at = pol(d, (deg * Math.PI) / 180), r = round(54 * s), n = 3 + (k % 2);
      const circles = Array.from({ length: n }, (_, j): Pt => {
        const b = (j / n) * Math.PI * 2 + k;
        return [round(at[0] + r * 0.5 * Math.cos(b)), round(at[1] + r * 0.5 * Math.sin(b))];
      });
      return { at, r, circles, seat: round(r * 0.16) };
    });

  return { people, circles, others };
}
