import { describe, expect, it } from "vitest";
import { SIZE, initials, layoutCircle, type MapRound } from "./circleMap";

const seats = ["Ama", "Bo", "Cleo", "Dev", "Esi"].map((name, i) => ({ id: `u${i}`, name }));
const day = (d: number) => new Date(2026, 8, d);
const round = (id: string, phase: MapRound["phase"], d: number, responders: string[] = [], authorId = "u0", replyTo: string | null = null): MapRound =>
  ({ id, question: id, phase, authorId, responders, at: day(d), closesAt: null, replyTo });
const reply = (id: string, to: string, phase: MapRound["phase"], d: number, responders: string[] = []) => round(id, phase, d, responders, "u1", to);

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

  describe("replies", () => {
    const base = [
      round("a", "closed", 1, ["u0", "u1", "u2"]), round("b", "closed", 2, ["u0", "u1", "u2", "u3"]),
      round("c", "closed", 3, ["u0", "u1"]), round("live", "open", 9, ["u0"]),
    ];

    it("keep the spiral to the main line, and branch replies off the round they answer", () => {
      const { thread, nodes, links } = layoutCircle(seats, [...base, reply("r1", "b", "closed", 4, ["u0", "u2"])]);
      expect(thread.map((n) => n.id)).toEqual(["a", "b", "c", "live"]);
      const r1 = nodes.find((n) => n.id === "r1")!;
      expect(r1.reply).toBe(true);
      expect(r1.r).toBeLessThan(Math.min(...thread.map((n) => n.r)));
      expect(links).toMatchObject([{ from: "b", to: "r1", folded: null }]);
    });

    it("wait as spurs off the round, not the seat", () => {
      const { spurs, nodes } = layoutCircle(seats, [...base, reply("w", "a", "nominated", 5), reply("q", "a", "queued", 6)]);
      expect(spurs.map((s) => [s.round.id, s.onRound, s.queued])).toEqual([["w", true, false], ["q", true, true]]);
      expect(nodes.some((n) => n.id === "w")).toBe(false);
      const a = nodes.find((n) => n.id === "a")!;
      for (const s of spurs) expect(Math.hypot(s.x1 - a.x, s.y1 - a.y)).toBeCloseTo(a.r + 3, 0);
    });

    it("fold a chain deeper than three to its first two and its newest end", () => {
      const chain = [
        reply("d1", "b", "closed", 4, ["u0"]), reply("d2", "d1", "closed", 5, ["u0"]),
        reply("d3", "d2", "closed", 6, ["u0"]), reply("d4", "d3", "closed", 7, ["u0"]), reply("d5", "d4", "open", 8),
      ];
      const { nodes, links } = layoutCircle(seats, [...base, ...chain]);
      expect(nodes.filter((n) => n.reply).map((n) => n.id)).toEqual(["d1", "d2", "d5"]);
      const fold = links.find((l) => l.folded)!;
      expect(fold).toMatchObject({ from: "d2", to: "d5", folded: { ids: ["d3", "d4"] } });
      expect(fold.folded!.dots).toHaveLength(2);
    });

    it("stay clear of other nodes, and come out the same every time", () => {
      const many = [...base, ...["a", "b", "c", "live"].flatMap((to, i) => [reply(`x${i}`, to, "closed", 10 + i, ["u0", "u1"]), reply(`y${i}`, to, "closed", 20 + i, ["u2"])])];
      const one = layoutCircle(seats, many), two = layoutCircle(seats, many);
      expect(one).toEqual(two);
      const ns = one.nodes;
      for (let i = 0; i < ns.length; i++)
        for (let j = i + 1; j < ns.length; j++) expect(Math.hypot(ns[i].x - ns[j].x, ns[i].y - ns[j].y)).toBeGreaterThan(ns[i].r + ns[j].r);
    });

    it("leave out replies to rounds that aren't on the map", () => {
      const { nodes, spurs } = layoutCircle(seats, [...base, reply("orphan", "gone", "closed", 5, ["u0"]), reply("w", "gone", "nominated", 6)]);
      expect(nodes.some((n) => n.id === "orphan")).toBe(false);
      expect(spurs).toHaveLength(0);
    });
  });

  it("makes initials from one name or two", () => {
    expect(initials("Mark")).toBe("Ma");
    expect(initials("Amy Chen")).toBe("AC");
  });
});
