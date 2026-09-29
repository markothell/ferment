// The circle map's geometry (design/ferment/previews/circle.html, approved
// 2026-09-28): seats on a ring; rounds threaded in the order they happened,
// in a loose spiral of straight segments from the oldest outside to the open
// question at the center; one person's waiting suggestions as short spurs off
// their seat. Pure, so it can be tested and drawn anywhere.

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
};

export type PlacedSeat = MapSeat & { x: number; y: number; a: number; initials: string; labelAbove: boolean };
export type PlacedNode = MapRound & { x: number; y: number; r: number; live: boolean; tellers: number[] };
export type PlacedSpur = { round: MapRound; queued: boolean; x1: number; y1: number; x2: number; y2: number };

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

  const explored = roundsIn.filter((r) => r.phase === "closed").sort(byTime).slice(-MAX_PAST);
  const open = roundsIn.filter((r) => r.phase === "open").sort(byTime);
  const ordered = [...explored, ...open];

  const nodes: PlacedNode[] = ordered.map((r) => {
    const live = r.phase === "open";
    const tellers = r.responders.map((id) => seatIndex.get(id)).filter((i): i is number => i !== undefined);
    return { ...r, live, tellers, x: C, y: C, r: live ? 13 : 6 + 12 * (tellers.length / n) };
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

  // Waiting suggestions: spurs pointing out from their author's seat, fanned
  // when one person has several.
  const perSeat = new Map<number, number>();
  const spurs: PlacedSpur[] = roundsIn
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
        round: r, queued: r.phase === "queued",
        x1: q(s.x + (SEAT_R + 3) * Math.cos(dir)), y1: q(s.y + (SEAT_R + 3) * Math.sin(dir)),
        x2: q(s.x + (SEAT_R + 24) * Math.cos(dir)), y2: q(s.y + (SEAT_R + 24) * Math.sin(dir)),
      }];
    });

  // The thread runs oldest → newest, through the center.
  const threadPoints = [...past, ...(center ? [center] : [])];
  for (const nd of threadPoints) { nd.x = q(nd.x); nd.y = q(nd.y); nd.r = q(nd.r); }
  return { seats, nodes: threadPoints, spurs, center };
}
