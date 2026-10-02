// The community map, "a circle of circles" (design/ferment/previews/community.html,
// chosen 2026-09-29): everyone on an outer ring; each circle inside, pulled
// toward its members; the community's open questions at the center. Pure.

import type { CircleColor } from "./circleColors";

export const CSIZE = 560;
const C = CSIZE / 2;
export const RING_R = 232;
const CENTER_CLEAR = 58; // room for the open questions
const GAP = 34;          // between circles, room for a label
// Seats sit no further apart than they would with this many people, so a young
// community gathers in an arc at the top instead of scattering round the ring;
// from here on the ring closes.
const FULL_AT = 36;

// Server and browser can disagree in the last digits of a float, which breaks
// hydration; every coordinate leaves here rounded.
const q = (v: number) => Math.round(v * 100) / 100;

export type CommunityPerson = { id: string; name: string };
export type CommunityCircle = {
  id: string; slug: string; name: string; members: string[]; color?: CircleColor;
  forming: boolean; explored: number; open: number;
};

export function layoutCommunity(people: CommunityPerson[], circlesIn: CommunityCircle[]) {
  // Seats circle by circle, so each circle's lines stay short; people in no
  // circle yet sit together after them.
  const known = new Set(people.map((p) => p.id));
  const order: string[] = [];
  const seen = new Set<string>();
  for (const c of circlesIn) for (const id of c.members) if (known.has(id) && !seen.has(id)) { seen.add(id); order.push(id); }
  for (const p of people) if (!seen.has(p.id)) order.push(p.id);

  const byId = new Map(people.map((p) => [p.id, p]));
  const inCircle = new Set(circlesIn.flatMap((c) => c.members));
  const n = Math.max(order.length, 1);
  const seatR = n > 60 ? 4 : 5.5;
  const full = n >= FULL_AT;
  const step = (2 * Math.PI) / (full ? n : FULL_AT);
  const seats = order.map((id, k) => {
    const a = -Math.PI / 2 + step * (k - (n - 1) / 2);
    return { id, name: byId.get(id)!.name, a, x: q(C + RING_R * Math.cos(a)), y: q(C + RING_R * Math.sin(a)), inCircle: inCircle.has(id) };
  });
  const seatOf = new Map(seats.map((s) => [s.id, s]));

  const maxExplored = Math.max(1, ...circlesIn.map((c) => c.explored));
  const nodes = circlesIn.map((c) => {
    let sx = 0, sy = 0;
    for (const id of c.members) {
      const s = seatOf.get(id);
      if (s) { sx += Math.cos(s.a); sy += Math.sin(s.a); }
    }
    const a = sx || sy ? Math.atan2(sy, sx) : 0;
    const r = 13 + 2.3 * Math.min(c.members.length, 12);
    return {
      ...c, r, x: C + 138 * Math.cos(a), y: C + 138 * Math.sin(a),
      core: c.forming ? 0 : 4 + (r - 8) * Math.sqrt(c.explored / maxExplored),
      seats: c.members.map((id) => seatOf.get(id)).filter((s): s is (typeof seats)[number] => Boolean(s)),
    };
  });

  // Nudge circles apart; keep them clear of the center and inside the ring.
  for (let it = 0; it < 160; it++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const A = nodes[i], B = nodes[j];
        let dx = B.x - A.x, dy = B.y - A.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1; }
        const want = A.r + B.r + GAP;
        if (d < want) {
          const p = (want - d) / 2;
          A.x -= (dx / d) * p; A.y -= (dy / d) * p;
          B.x += (dx / d) * p; B.y += (dy / d) * p;
        }
      }
    }
    for (const nd of nodes) {
      const dx = nd.x - C, dy = nd.y - C, d = Math.hypot(dx, dy) || 1;
      const t = Math.max(nd.r + CENTER_CLEAR, Math.min(RING_R - nd.r - 30, d));
      nd.x = C + (dx / d) * t; nd.y = C + (dy / d) * t;
    }
  }

  // An open round: one green dot on the circle's edge, upper right.
  const openDot = (nd: { x: number; y: number; r: number }) => ({ x: q(nd.x + nd.r * Math.SQRT1_2), y: q(nd.y - nd.r * Math.SQRT1_2) });

  return {
    seats, seatR, center: { x: C, y: C }, ringR: RING_R, full,
    nodes: nodes.map((nd) => ({ ...nd, x: q(nd.x), y: q(nd.y), r: q(nd.r), core: q(nd.core), dot: nd.open > 0 ? openDot(nd) : null })),
  };
}
