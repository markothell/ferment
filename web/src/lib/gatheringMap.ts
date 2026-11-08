// The gathering map, "a circle of circles" (design/ferment/archive/gathering.html,
// chosen 2026-09-29): everyone on an outer ring; each circle inside, pulled
// toward its members; the gathering's open questions at the center. Pure.

import type { CircleColor } from "./circleColors";

export const CSIZE = 560;
const C = CSIZE / 2;
export const RING_R = 232;
const CENTER_CLEAR = 58; // room for the open questions
const CENTER_R = 24;     // the open questions' mark
const PAD = 8;           // between one circle-and-label and the next
// Labels: a rough width per character at 11.5px, and the line height; a long
// name breaks onto two lines.
const CHAR_W = 6.2;
const LINE_H = 13.5;
const LABEL_GAP = 4;
const WRAP_AT = 18;
// Seats sit no further apart than they would with this many people, so a young
// gathering gathers in an arc at the top instead of scattering round the ring;
// from here on the ring closes.
const FULL_AT = 36;

// Server and browser can disagree in the last digits of a float, which breaks
// hydration; every coordinate leaves here rounded.
const q = (v: number) => Math.round(v * 100) / 100;

export type GatheringPerson = { id: string; name: string };
export type GatheringCircle = {
  id: string; slug: string; name: string; members: string[]; color?: CircleColor;
  forming: boolean; explored: number; open: number;
};

/** A circle's name on one line, or two, broken at the space nearest the middle. */
export function wrapLabel(name: string): string[] {
  if (name.length <= WRAP_AT) return [name];
  let best = -1;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === " " && (best < 0 || Math.abs(i - name.length / 2) < Math.abs(best - name.length / 2))) best = i;
  }
  return best < 0 ? [name] : [name.slice(0, best), name.slice(best + 1)];
}

export function layoutGathering(people: GatheringPerson[], circlesIn: GatheringCircle[]) {
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
    const r = 13 + 2.3 * Math.min(c.members.length, 12);
    const label = wrapLabel(c.name);
    return {
      ...c, r, label, x: C, y: C,
      // Where its people pull it, if they sit anywhere.
      pull: sx || sy ? Math.atan2(sy, sx) : null as number | null,
      hw: Math.max(r, (Math.max(...label.map((l) => l.length)) * CHAR_W) / 2 + 4),
      below: LABEL_GAP + label.length * LINE_H,
      core: c.forming ? 0 : 4 + (r - 8) * Math.sqrt(c.explored / maxExplored),
      seats: c.members.map((id) => seatOf.get(id)).filter((s): s is (typeof seats)[number] => Boolean(s)),
    };
  });

  // Around an orbit first: each circle toward its people, but circles that
  // share people (a new gathering's are all its host's) fan out instead of
  // stacking up. Their order round the orbit follows their people.
  const m = nodes.length;
  const ORBIT = 150;
  const angle = nodes.map((nd, i) => nd.pull ?? -Math.PI / 2 + (2 * Math.PI * i) / Math.max(m, 1));
  if (m > 1) {
    const order = nodes.map((_, i) => i).sort((i, j) => angle[i] - angle[j] || i - j);
    const wide = nodes.reduce((t, nd) => t + 2 * nd.hw, 0) / m + 14;
    const gap = Math.min((2 * Math.PI) / m, 2 * Math.asin(Math.min(1, wide / (2 * ORBIT))));
    const a = order.map((i) => angle[i]);
    for (let it = 0; it < 200; it++) {
      let moved = false;
      for (let k = 0; k < m; k++) {
        const next = k + 1 < m ? a[k + 1] : a[0] + 2 * Math.PI;
        const short = gap - (next - a[k]);
        if (short > 1e-6) {
          a[k] -= short / 2;
          if (k + 1 < m) a[k + 1] += short / 2; else a[0] += short / 2;
          moved = true;
        }
      }
      if (!moved) break;
      a.sort((x, y) => x - y);
    }
    order.forEach((i, k) => { angle[i] = a[k]; });
  }
  nodes.forEach((nd, i) => { nd.x = C + ORBIT * Math.cos(angle[i]); nd.y = C + ORBIT * Math.sin(angle[i]); });

  // Then nudge apart whatever still touches, labels included; keep clear of
  // the center and inside the ring.
  const box = (nd: { x: number; y: number; r: number; hw: number; below: number }) =>
    ({ l: nd.x - nd.hw, r: nd.x + nd.hw, t: nd.y - nd.r, b: nd.y + nd.r + nd.below });
  const middle = { x: C, y: C, r: CENTER_R, hw: CENTER_R, below: 0 };
  for (let it = 0; it < 200; it++) {
    let moved = false;
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j <= m; j++) {
        const A = nodes[i], B = j < m ? nodes[j] : middle;
        const a = box(A), b = box(B);
        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l) + PAD;
        const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t) + PAD;
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const share = j < m ? 0.5 : 1; // the center doesn't move
        if (ox < oy) {
          const dir = A.x < B.x || (A.x === B.x && i % 2 === 0) ? -1 : 1;
          A.x += dir * ox * share;
          if (j < m) B.x -= dir * ox * share;
        } else {
          const dir = (a.t + a.b) < (b.t + b.b) || ((a.t + a.b) === (b.t + b.b) && i % 2 === 0) ? -1 : 1;
          A.y += dir * oy * share;
          if (j < m) B.y -= dir * oy * share;
        }
      }
    }
    for (const nd of nodes) {
      const dx = nd.x - C, dy = nd.y - C, d = Math.hypot(dx, dy) || 1;
      const t = Math.max(nd.r + CENTER_CLEAR, Math.min(RING_R - nd.r - 30, d));
      nd.x = C + (dx / d) * t; nd.y = C + (dy / d) * t;
      nd.y = Math.min(nd.y, CSIZE - 4 - nd.r - nd.below);
      nd.x = Math.max(nd.hw + 4, Math.min(CSIZE - nd.hw - 4, nd.x));
    }
    if (!moved) break;
  }

  // An open round: one green dot on the circle's edge, upper right.
  const openDot = (nd: { x: number; y: number; r: number }) => ({ x: q(nd.x + nd.r * Math.SQRT1_2), y: q(nd.y - nd.r * Math.SQRT1_2) });

  return {
    seats, seatR, center: { x: C, y: C }, ringR: RING_R, full,
    nodes: nodes.map((nd) => ({ ...nd, x: q(nd.x), y: q(nd.y), r: q(nd.r), core: q(nd.core), dot: nd.open > 0 ? openDot(nd) : null })),
  };
}
