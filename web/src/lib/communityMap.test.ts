import { describe, expect, it } from "vitest";
import { CSIZE, layoutCommunity, type CommunityCircle } from "./communityMap";

const people = Array.from({ length: 30 }, (_, i) => ({ id: `u${i}`, name: `P${i}` }));
const circle = (id: string, members: number[], extra: Partial<CommunityCircle> = {}): CommunityCircle => ({
  id, slug: id, name: id, members: members.map((i) => `u${i}`), forming: false, explored: 3, open: 0, ...extra,
});

describe("layoutCommunity", () => {
  const circles = [
    circle("a", [0, 1, 2, 3, 4, 5, 6, 7], { explored: 9, open: 1 }),
    circle("b", [5, 6, 7, 8, 9, 10, 11], { explored: 2 }),
    circle("c", [12, 13, 14, 15, 16]),
    circle("d", [17, 18], { forming: true, explored: 0 }),
  ];
  const { seats, nodes } = layoutCommunity(people, circles);

  it("seats everyone once, circle members first and the rest after", () => {
    expect(seats).toHaveLength(30);
    expect(new Set(seats.map((s) => s.id)).size).toBe(30);
    expect(seats.slice(0, 19).every((s) => s.inCircle)).toBe(true);
    expect(seats.slice(19).every((s) => !s.inCircle)).toBe(true);
  });

  it("keeps circles apart, off the center, and inside the ring", () => {
    const C = CSIZE / 2;
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.hypot(nodes[i].x - C, nodes[i].y - C);
      expect(d).toBeGreaterThanOrEqual(nodes[i].r + 57);
      expect(d + nodes[i].r).toBeLessThanOrEqual(232);
      for (let j = i + 1; j < nodes.length; j++) {
        expect(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y)).toBeGreaterThan(nodes[i].r + nodes[j].r + 20);
      }
    }
  });

  it("marks what's open with a dot, and gives a forming circle no core", () => {
    expect(nodes[0].dot).not.toBeNull();
    expect(nodes[1].dot).toBeNull();
    expect(nodes[3].core).toBe(0);
    expect(nodes[0].core).toBeGreaterThan(nodes[1].core);
  });

  it("gathers a young community in an arc at the top, and closes the ring once it's full", () => {
    const few = layoutCommunity(people.slice(0, 5), [circle("a", [0, 1, 2])]);
    expect(few.full).toBe(false);
    const gaps = few.seats.slice(1).map((s, k) => s.a - few.seats[k].a);
    for (const g of gaps) expect(g).toBeCloseTo((2 * Math.PI) / 36);
    expect((few.seats[0].a + few.seats[4].a) / 2).toBeCloseTo(-Math.PI / 2);

    const many = layoutCommunity(Array.from({ length: 40 }, (_, i) => ({ id: `u${i}`, name: `P${i}` })), []);
    expect(many.full).toBe(true);
    expect(many.seats[1].a - many.seats[0].a).toBeCloseTo((2 * Math.PI) / 40);
  });
});
