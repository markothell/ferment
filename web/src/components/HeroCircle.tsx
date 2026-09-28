import { seats, initials, r2 } from "@/lib/ring";

// The hero: a circle a few months in, drawn in the circle app's grammar.
// People sit on the ring, all equal, all facing a common centre. What the group
// explored together gathers in the middle, sized by how many took part and
// pulled toward the people who did. What someone has put forward that nobody
// has joined yet is a short ochre spur at their seat. The one sky mark is the
// question running right now.

const SIZE = 440;
const C = SIZE / 2;
const RING_R = 150;
const MEMBER_R = 20;

const PEOPLE = ["Ama", "Bo", "Cleo", "Dev", "Esi", "Finn", "Gus", "Hana", "Ines"];
const N = PEOPLE.length;

// Finished explorations: who took part.
const EXPLORED: number[][] = [
  [0, 1, 2, 3, 7, 8],
  [3, 4, 5],
  [5, 6, 7, 8, 0, 1, 2],
  [2, 3],
  [6, 7],
];

// Put forward, nobody joined yet. `queued` means the circle said yes and it waits its turn.
const SPURS = [
  { who: 4, fan: 0, queued: false },
  { who: 6, fan: 0, queued: true },
  { who: 1, fan: 0.4, queued: false },
];

function layout() {
  const pos = seats(N, C, C, RING_R);
  const nodes = EXPLORED.map((tellers) => {
    const cx = tellers.reduce((s, i) => s + pos[i].x, 0) / tellers.length;
    const cy = tellers.reduce((s, i) => s + pos[i].y, 0) / tellers.length;
    return {
      tellers,
      x: C + (cx - C) * 0.55,
      y: C + (cy - C) * 0.55,
      r: 8 + 16 * (tellers.length / N),
    };
  });
  // The live one sits in the crown.
  const live = { x: C, y: C, r: 13 };

  // A few deterministic relaxation passes so nothing overlaps.
  const all = [...nodes, live];
  for (let pass = 0; pass < 60; pass++) {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const min = a.r + b.r + 12;
        if (d < min) {
          const push = (min - d) / 2;
          // The live node holds the centre; everything else moves around it.
          const aw = a === live ? 0 : b === live ? 2 : 1;
          const bw = b === live ? 0 : a === live ? 2 : 1;
          a.x -= (dx / d) * push * aw; a.y -= (dy / d) * push * aw;
          b.x += (dx / d) * push * bw; b.y += (dy / d) * push * bw;
        }
      }
    }
  }

  const spurs = SPURS.map((s) => {
    const p = pos[s.who];
    const dir = p.a + s.fan;
    return {
      ...s,
      x1: p.x + (MEMBER_R + 3) * Math.cos(dir),
      y1: p.y + (MEMBER_R + 3) * Math.sin(dir),
      x2: p.x + (MEMBER_R + 24) * Math.cos(dir),
      y2: p.y + (MEMBER_R + 24) * Math.sin(dir),
    };
  });

  return { pos, nodes, live, spurs };
}

const GEO = layout();

export function HeroCircle() {
  const { pos, nodes, live, spurs } = GEO;
  let edgeIndex = 0;

  return (
    <figure className="mx-auto w-full max-w-[30rem]">
      <svg
        viewBox={`0 20 ${SIZE} ${SIZE - 10}`}
        role="img"
        aria-label="A circle of nine people. Five things they explored together sit in the middle; three ideas wait at the edge; one question is live right now."
        className="block h-auto w-full"
      >
        {/* The toono: the crown ring everything converges on. */}
        <circle className="fade-in" cx={C} cy={C} r={58} fill="none" stroke="var(--rule)" />

        <g stroke="var(--rule-strong)" strokeWidth="1">
          {nodes.flatMap((node, ni) =>
            node.tellers.map((t) => {
              const p = pos[t];
              const delay = 0.5 + edgeIndex++ * 0.04;
              return (
                <line
                  key={`${ni}-${t}`}
                  className="draw"
                  style={{ animationDelay: `${r2(delay)}s` }}
                  pathLength={1}
                  x1={r2(p.x)} y1={r2(p.y)} x2={r2(node.x)} y2={r2(node.y)}
                />
              );
            }),
          )}
        </g>

        {spurs.map((s, i) => (
          <g key={i} className="fade-in" style={{ animationDelay: `${1.6 + i * 0.15}s` }}>
            <line
              x1={r2(s.x1)} y1={r2(s.y1)} x2={r2(s.x2)} y2={r2(s.y2)}
              stroke="var(--ochre)" strokeWidth="2.5" strokeLinecap="round"
            />
            {s.queued && <circle cx={r2(s.x2)} cy={r2(s.y2)} r={3.5} fill="var(--ochre)" />}
          </g>
        ))}

        {nodes.map((node, i) => (
          <circle
            key={i}
            className="fade-in"
            style={{ animationDelay: `${0.9 + i * 0.12}s` }}
            cx={r2(node.x)} cy={r2(node.y)} r={r2(node.r)}
            fill="var(--shared)" stroke="var(--rope)" strokeWidth="1.2"
          />
        ))}

        {/* Live: the only sky on the page. */}
        <g className="fade-in" style={{ animationDelay: "1.4s" }}>
          <circle className="pulse" cx={r2(live.x)} cy={r2(live.y)} r={live.r + 3}
            fill="none" stroke="var(--sky)" strokeWidth="1.5" />
          <circle cx={r2(live.x)} cy={r2(live.y)} r={live.r}
            fill="var(--card)" stroke="var(--sky)" strokeWidth="1.8" />
        </g>

        {PEOPLE.map((name, i) => {
          const p = pos[i];
          const above = Math.sin(p.a) < -0.5;
          return (
            <g key={name} className="fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
              <circle cx={r2(p.x)} cy={r2(p.y)} r={MEMBER_R} fill="var(--card)"
                stroke="var(--rule-strong)" strokeWidth="1.2" />
              <text
                x={r2(p.x)} y={r2(p.y + MEMBER_R * 0.28)} textAnchor="middle"
                fill="var(--ink-soft)"
                style={{ font: `${Math.round(MEMBER_R * 0.78)}px var(--font-display)` }}
              >
                {initials(name)}
              </text>
              <text
                x={r2(p.x)}
                y={r2(above ? p.y - MEMBER_R - 8 : p.y + MEMBER_R + 14)}
                textAnchor="middle" fill="var(--ink-faint)"
                style={{ font: "11px var(--font-body)" }}
              >
                {name}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
