import { describe, expect, it } from "vitest";
import { SIZE, initials, layoutCircle, type MapRound } from "./circleMap";

const seats = ["Ama", "Bo", "Cleo", "Dev", "Esi"].map((name, i) => ({ id: `u${i}`, name }));
const day = (d: number) => new Date(2026, 8, d);
const round = (id: string, phase: MapRound["phase"], d: number, responders: string[] = [], authorId = "u0"): MapRound =>
  ({ id, question: id, phase, authorId, responders, at: day(d), closesAt: null });

describe("layoutCircle", () => {
  it("puts the newest open round at the center and threads the rest oldest first", () => {
    const { nodes, center } = layoutCircle(seats, [
      round("b", "closed", 2, ["u0", "u1"]), round("a", "closed", 1, ["u0"]),
      round("live", "open", 5), round("older-live", "open", 4),
    ]);
    expect(center?.id).toBe("live");
    expect(center).toMatchObject({ x: SIZE / 2, y: SIZE / 2 });
    expect(nodes.map((n) => n.id)).toEqual(["a", "b", "older-live", "live"]);
    const dist = (n: { x: number; y: number }) => Math.hypot(n.x - SIZE / 2, n.y - SIZE / 2);
    expect(dist(nodes[0])).toBeGreaterThan(dist(nodes[1]));
  });

  it("sizes explored rounds by how many of the seats took part", () => {
    const { nodes } = layoutCircle(seats, [round("few", "closed", 1, ["u0"]), round("all", "closed", 2, seats.map((s) => s.id))]);
    expect(nodes[1].r).toBeGreaterThan(nodes[0].r);
    expect(nodes[1].tellers).toEqual([0, 1, 2, 3, 4]);
  });

  it("draws waiting suggestions as spurs off their author's seat, and skips people who left", () => {
    const { spurs } = layoutCircle(seats, [
      round("s1", "nominated", 1, [], "u2"), round("s2", "queued", 2, [], "u2"), round("gone", "nominated", 3, [], "nobody"),
    ]);
    expect(spurs.map((s) => [s.round.id, s.queued])).toEqual([["s1", false], ["s2", true]]);
    expect(spurs[0].x2).not.toBeCloseTo(spurs[1].x2);
  });

  it("keeps nodes apart along the spiral", () => {
    const many = Array.from({ length: 12 }, (_, i) => round(`r${i}`, "closed", i + 1, ["u0", "u1", "u2"]));
    const { nodes } = layoutCircle(seats, many);
    for (let i = 1; i < nodes.length; i++) {
      const gap = Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y);
      expect(gap).toBeGreaterThanOrEqual(nodes[i].r + nodes[i - 1].r + 13.9);
    }
  });

  it("makes initials from one name or two", () => {
    expect(initials("Mark")).toBe("Ma");
    expect(initials("Amy Chen")).toBe("AC");
  });
});
