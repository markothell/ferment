// The circle map's geometry (design/ferment/archive/circle.html, approved
// 2026-09-28): seats on a ring; rounds threaded in the order they happened,
// in a loose spiral of straight segments from the oldest outside to the open
// question at the center; one person's waiting suggestions as short spurs off
// their seat. Replies (design/ferment/archive/replies.html) branch off the
// round they answer: a spur while they wait, a smaller node once they open,
// and a chain deeper than three folds to ●─●··●. Pure, so it can be tested
// and drawn anywhere.

export const SIZE = 440;
const C = SIZE / 2;
const RING_R = 150;
export const SEAT_R = 20;
const MAX_PAST = 16; // the spiral reaches the seats around here

// Server and browser can disagree in the last digits of a float, which breaks
// hydration; every coordinate leaves here rounded.
const q = (v: number) => Math.round(v * 100) / 100;

export type MapSeat = { id: string; name: string };
export type MapRound = {
  id: string;
  question: string;
  phase: "nominated" | "queued" | "open" | "closed" | "skipped";
  authorId: string;
  responders: string[];
  at: Date; // when it opened (or was suggested)
  closesAt: Date | null;
  /** the round this one answers; it goes on that round's branch */
  replyTo?: string | null;
};

export type PlacedSeat = MapSeat & { x: number; y: number; a: number; initials: string; labelAbove: boolean };
export type PlacedNode = MapRound & { x: number; y: number; r: number; live: boolean; tellers: number[]; reply: boolean };
/** A waiting suggestion: off its author's seat, or off the round it replies to. */
export type PlacedSpur = { round: MapRound; queued: boolean; onRound: boolean; x1: number; y1: number; x2: number; y2: number };
/** A piece of branch from a round to a reply. `folded`: the replies drawn as dots in between. */
export type PlacedLink = { from: string; to: string; x1: number; y1: number; x2: number; y2: number; folded: { ids: string[]; dots: { x: number; y: number }[] } | null };

const REPLY_GAP = 11; // between a round and its reply node
const FOLD_LEN = 9; // extra length a folded run takes
const SPUR_LEN = 21;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const w = parts[0] ?? "?";
  return w.charAt(0).toUpperCase() + w.slice(1, 2);
}

export function layoutCircle(seatsIn: MapSeat[], roundsIn: MapRound[]) {
  const n = Math.max(seatsIn.length, 1);
  const seats: PlacedSeat[] = seatsIn.map((s, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return {
      ...s, a, x: q(C + RING_R * Math.cos(a)), y: q(C + RING_R * Math.sin(a)),
      initials: initials(s.name), labelAbove: Math.sin(a) < -0.5,
    };
  });
  const seatIndex = new Map(seats.map((s, i) => [s.id, i]));
  const byTime = (a: MapRound, b: MapRound) => a.at.getTime() - b.at.getTime();

  const main = roundsIn.filter((r) => !r.replyTo);
  const explored = main.filter((r) => r.phase === "closed").sort(byTime).slice(-MAX_PAST);
  const open = main.filter((r) => r.phase === "open").sort(byTime);
  const ordered = [...explored, ...open];

  const tellersOf = (r: MapRound) => r.responders.map((id) => seatIndex.get(id)).filter((i): i is number => i !== undefined);
  const nodes: PlacedNode[] = ordered.map((r) => {
    const live = r.phase === "open";
    const tellers = tellersOf(r);
    return { ...r, live, tellers, reply: false, x: C, y: C, r: live ? 13 : 6 + 12 * (tellers.length / n) };
  });

  // The newest open round holds the center; everything before it spirals out.
  const center = open.length ? nodes[nodes.length - 1] : null;
  const past = center ? nodes.slice(0, -1) : nodes;

  // r = R0 + B·(θ − θ0). Newest nearest the center, oldest furthest out; step
  // along the spiral until the straight-line gap to the previous node fits.
  const R0 = center ? 40 : 18, B = 10.5, TH0 = -2.3;
  let th = TH0;
  let prev: PlacedNode | null = center;
  for (let k = past.length - 1; k >= 0; k--) {
    const node = past[k];
    if (prev) {
      const want = prev.r + node.r + 14;
      for (let guard = 0; guard < 5000; guard++) {
        th += 0.02;
        const rr = R0 + B * (th - TH0);
        if (Math.hypot(C + rr * Math.cos(th) - prev.x, C + rr * Math.sin(th) - prev.y) >= want) break;
      }
    }
    const rr = R0 + B * (th - TH0);
    node.x = C + rr * Math.cos(th);
    node.y = C + rr * Math.sin(th);
    prev = node;
  }

  // Waiting suggestions that aren't replies: spurs pointing out from their
  // author's seat, fanned when one person has several.
  const perSeat = new Map<number, number>();
  const spurs: PlacedSpur[] = main
    .filter((r) => r.phase === "nominated" || r.phase === "queued")
    .sort(byTime)
    .flatMap((r) => {
      const i = seatIndex.get(r.authorId);
      if (i === undefined) return [];
      const k = perSeat.get(i) ?? 0;
      perSeat.set(i, k + 1);
      const fan = k === 0 ? 0 : (k % 2 ? 1 : -1) * 0.4 * Math.ceil(k / 2);
      const s = seats[i];
      const dir = s.a + fan;
      return [{
        round: r, queued: r.phase === "queued", onRound: false,
        x1: s.x + (SEAT_R + 3) * Math.cos(dir), y1: s.y + (SEAT_R + 3) * Math.sin(dir),
        x2: s.x + (SEAT_R + 24) * Math.cos(dir), y2: s.y + (SEAT_R + 24) * Math.sin(dir),
      }];
    });

  // The thread runs oldest → newest, through the center.
  const thread = [...past, ...(center ? [center] : [])];
  const { branchNodes, links, replySpurs } = growBranches(thread, roundsIn, tellersOf, n);

  const all = [...thread, ...branchNodes];
  for (const nd of all) { nd.x = q(nd.x); nd.y = q(nd.y); nd.r = q(nd.r); }
  const qSpur = (s: PlacedSpur): PlacedSpur => ({ ...s, x1: q(s.x1), y1: q(s.y1), x2: q(s.x2), y2: q(s.y2) });
  const qLink = (l: PlacedLink): PlacedLink => ({
    ...l, x1: q(l.x1), y1: q(l.y1), x2: q(l.x2), y2: q(l.y2),
    folded: l.folded && { ids: l.folded.ids, dots: l.folded.dots.map((d) => ({ x: q(d.x), y: q(d.y) })) },
  });
  return { seats, thread, nodes: all, spurs: [...spurs, ...replySpurs].map(qSpur), links: links.map(qLink), center };
}

// ── Branches ──────────────────────────────────────────────────────────────

type Pt = { x: number; y: number };
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/**
 * Replies grow breadth-first from the rounds already placed. Each one leaves
 * its parent in whichever of 36 directions has the most room from other
 * nodes, the thread, other branches and the seats, leaning outward (and, for
 * a reply to a reply, onward in its parent's direction). Deterministic.
 */
function growBranches(thread: PlacedNode[], roundsIn: MapRound[], tellersOf: (r: MapRound) => number[], seatCount: number) {
  const byTime = (a: MapRound, b: MapRound) => a.at.getTime() - b.at.getTime();
  const replies = roundsIn.filter((r) => r.replyTo && r.phase !== "skipped").sort(byTime);
  const kids = new Map<string, MapRound[]>();
  for (const r of replies) kids.set(r.replyTo!, [...(kids.get(r.replyTo!) ?? []), r]);
  const isNode = (r: MapRound) => r.phase === "open" || r.phase === "closed";
  const replyR = (r: MapRound, tellers: number) => (r.phase === "open" ? 5.5 : 2.5 + 4 * (tellers / seatCount));

  const branchNodes: PlacedNode[] = [], links: PlacedLink[] = [], replySpurs: PlacedSpur[] = [];
  const depth = new Map<string, number>(thread.map((t) => [t.id, 0]));
  const heading = new Map<string, number>();
  const obstacles: (Pt & { r: number; id?: string })[] = thread.map((t) => t);
  const segs: [PlacedNode, PlacedNode][] = thread.slice(1).map((t, i) => [thread[i], t]);

  const queue = [...thread];
  while (queue.length) {
    const pp = queue.shift()!;
    const radial = pp.x === C && pp.y === C ? -Math.PI / 2 : Math.atan2(pp.y - C, pp.x - C);
    const onward = heading.get(pp.id);
    for (const child of kids.get(pp.id) ?? []) {
      const node = isNode(child);

      // From depth 2, a chain that runs deeper than 3 shows only its newest end.
      let shown = child;
      let skipped: MapRound[] = [];
      if (node && depth.get(pp.id) === 2) {
        const path = [child];
        for (;;) {
          const next = (kids.get(path[path.length - 1].id) ?? []).filter(isNode);
          if (!next.length) break;
          path.push(next[next.length - 1]);
        }
        if (path.length > 1) { shown = path[path.length - 1]; skipped = path.slice(0, -1); }
      }
      const tellers = tellersOf(shown);
      const cr = node ? replyR(shown, tellers.length) : 3.5;
      const reach = node ? pp.r + cr + REPLY_GAP + (skipped.length ? FOLD_LEN : 0) : pp.r + 3 + SPUR_LEN;

      let best = { score: -Infinity, ang: 0 };
      for (let s = 0; s < 36; s++) {
        const ang = (s * Math.PI) / 18;
        const tip = { x: pp.x + reach * Math.cos(ang), y: pp.y + reach * Math.sin(ang) };
        const mid = { x: pp.x + ((pp.r + reach) / 2) * Math.cos(ang), y: pp.y + ((pp.r + reach) / 2) * Math.sin(ang) };
        let room = Infinity;
        for (const p of [mid, tip]) {
          const pad = p === tip ? cr : 2;
          for (const o of obstacles) if (o !== pp) room = Math.min(room, Math.hypot(p.x - o.x, p.y - o.y) - o.r - pad);
          for (const [a, b] of segs) {
            if (a !== pp && b !== pp) room = Math.min(room, segDist(p, a, b) - pad);
            else {
              // keep clear of the thread leaving this node, by angle
              const o = a === pp ? b : a;
              const d = Math.abs(Math.atan2(Math.sin(ang - Math.atan2(o.y - pp.y, o.x - pp.x)), Math.cos(ang - Math.atan2(o.y - pp.y, o.x - pp.x))));
              room = Math.min(room, d * 30);
            }
          }
          room = Math.min(room, RING_R - SEAT_R - 4 - Math.hypot(p.x - C, p.y - C) - pad);
        }
        const score = Math.min(room, 10) + Math.cos(ang - (onward ?? radial)) * (onward !== undefined ? 5 : 2);
        if (score > best.score + 1e-9) best = { score, ang };
      }
      const u = { x: Math.cos(best.ang), y: Math.sin(best.ang) };
      const at = (d: number) => ({ x: pp.x + d * u.x, y: pp.y + d * u.y });

      if (!node) {
        const a = at(pp.r + 3), b = at(reach);
        replySpurs.push({ round: child, queued: child.phase === "queued", onRound: true, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        obstacles.push({ ...b, r: 4 }, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: 3 });
        continue;
      }
      const tip = at(reach);
      const placed: PlacedNode = { ...shown, x: tip.x, y: tip.y, r: cr, live: shown.phase === "open", tellers, reply: true };
      branchNodes.push(placed);
      obstacles.push(placed);
      segs.push([pp, placed]);
      depth.set(shown.id, (depth.get(pp.id) ?? 0) + 1);
      heading.set(shown.id, best.ang);
      const a = at(pp.r), b = at(reach - cr);
      let folded: PlacedLink["folded"] = null;
      if (skipped.length) {
        const f0 = pp.r + 4, f1 = reach - cr - 4;
        folded = { ids: skipped.map((r) => r.id), dots: [1 / 3, 2 / 3].map((t) => at(f0 + (f1 - f0) * t)) };
      }
      links.push({ from: pp.id, to: shown.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, folded });
      queue.push(placed);
    }
  }
  return { branchNodes, links, replySpurs };
}
