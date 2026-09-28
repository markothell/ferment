import { seats, initials, r2 } from "@/lib/ring";

// One drawing that moves through the five steps of the notebook sketch:
//   1 propose → 2 someone joins, it enters the circle → 3 the more join, the
//   bigger it gets → 4 each circle creates a visual → 5 shared back to the community.
// Every element is always mounted; a step only changes opacity and transform,
// so the browser can transition between any two steps in either direction.

export type Step = 1 | 2 | 3 | 4 | 5;

const SIZE = 400;
const C = SIZE / 2;
const RING_R = 132;
const MEMBER_R = 17;

const PEOPLE = ["Hal", "Ana", "Ben", "Chi", "Dara", "Eli", "Fay", "Gio"];
const N = PEOPLE.length;
const POS = seats(N, C, C, RING_R);

const PROPOSER = 1;
const JOINED: Record<Step, number[]> = {
  1: [PROPOSER],
  2: [PROPOSER, 2],
  3: [PROPOSER, 2, 3, 5, 6, 7],
  4: [PROPOSER, 2, 3, 5, 6, 7],
  5: [PROPOSER, 2, 3, 5, 6, 7],
};
const EVERY_EDGE = JOINED[3];

// The proposal's spur, pointing outward from the proposer's seat.
const SPUR = (() => {
  const p = POS[PROPOSER];
  return {
    x1: p.x + (MEMBER_R + 3) * Math.cos(p.a),
    y1: p.y + (MEMBER_R + 3) * Math.sin(p.a),
    x2: p.x + (MEMBER_R + 22) * Math.cos(p.a),
    y2: p.y + (MEMBER_R + 22) * Math.sin(p.a),
  };
})();

// The picture the circle makes: each answer placed on two axes. Near answers
// merge into one dot sized by how many.
const Q = { x: 120, y: 120, w: 160 };
const MARKS = [
  { x: 0.72, y: 0.78, n: 3 },
  { x: 0.62, y: 0.6, n: 1 },
  { x: 0.28, y: 0.7, n: 1 },
  { x: 0.8, y: 0.3, n: 1 },
  { x: 0.2, y: 0.22, n: 1 },
];

// The wider community: many people around many circles.
const COMMUNITY_R = 182;
const COMMUNITY = seats(64, C, C, COMMUNITY_R);
// Where copies of the picture travel to — and which neighbours light up around them.
const SHARE_ANGLES = [-90, 30, 150].map((d) => (d * Math.PI) / 180);

const ease = "cubic-bezier(.4,0,.2,1)";
const t = (ms = 700, delay = 0) => ({
  transition: `opacity ${ms}ms ${ease} ${delay}ms, transform ${ms}ms ${ease} ${delay}ms, fill ${ms}ms ${ease} ${delay}ms, stroke ${ms}ms ${ease} ${delay}ms`,
});

function MiniQuadrant({ size }: { size: number }) {
  const s = size / Q.w;
  return (
    <g transform={`scale(${r2(s)})`}>
      <rect x={-Q.w / 2} y={-Q.w / 2} width={Q.w} height={Q.w} rx={12}
        fill="var(--card)" stroke="var(--rope)" strokeWidth={1.2 / s} />
      <line x1={0} y1={-Q.w / 2 + 8} x2={0} y2={Q.w / 2 - 8} stroke="var(--rule-strong)" strokeWidth={1 / s} />
      <line x1={-Q.w / 2 + 8} y1={0} x2={Q.w / 2 - 8} y2={0} stroke="var(--rule-strong)" strokeWidth={1 / s} />
      {MARKS.map((m, i) => (
        <circle key={i}
          cx={r2(-Q.w / 2 + 14 + m.x * (Q.w - 28))}
          cy={r2(-Q.w / 2 + 14 + (1 - m.y) * (Q.w - 28))}
          r={r2(7 + 5 * Math.sqrt(m.n - 1))} fill="var(--ink-soft)" />
      ))}
    </g>
  );
}

export function CircleScene({ step }: { step: Step }) {
  const joined = new Set(JOINED[step]);
  const nodeScale = step === 2 ? 11 : step === 3 ? 27 : 0.001;
  const showNode = step === 2 || step === 3;
  const zoomed = step === 5;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" className="block h-full w-full"
      aria-label={[
        "One person proposes a question at their seat on the circle.",
        "A second person joins, and the question moves into the middle of the circle.",
        "Six of eight people have joined, and the question has grown large.",
        "The answers become a picture: dots placed on two axes.",
        "The circle shrinks into a wider ring of community, and copies of its picture travel out to it.",
      ][step - 1]}
    >
      {/* ——— The wider community (step 5) ——— */}
      <g style={{ ...t(700, zoomed ? 250 : 0), opacity: zoomed ? 1 : 0 }}>
        {COMMUNITY.map((p, i) => {
          const near = SHARE_ANGLES.some((a) => {
            let d = Math.abs(p.a - a) % (2 * Math.PI);
            if (d > Math.PI) d = 2 * Math.PI - d;
            return d < 0.42;
          });
          const lit = zoomed && near;
          return (
            <circle key={i} cx={r2(p.x)} cy={r2(p.y)} r={4.2}
              style={{
                ...t(600, zoomed ? 900 + (i % 16) * 35 : 0),
                fill: lit ? "var(--shared)" : "var(--card)",
                stroke: lit ? "var(--rope)" : "var(--rule-strong)",
              }}
              strokeWidth={1}
            />
          );
        })}
        {/* Other circles, out in the community. */}
        {[45, 135, 225, 315].map((deg) => {
          const a = (deg * Math.PI) / 180;
          const x = C + 150 * Math.cos(a), y = C + 150 * Math.sin(a);
          return (
            <g key={deg} transform={`translate(${r2(x)} ${r2(y)})`}>
              <circle r={15} fill="none" stroke="var(--rule-strong)" strokeDasharray="2 3" />
              {seats(6, 0, 0, 15).map((s, i) => (
                <circle key={i} cx={r2(s.x)} cy={r2(s.y)} r={3} fill="var(--card)" stroke="var(--rule-strong)" />
              ))}
            </g>
          );
        })}
        {/* Copies of this circle's picture, carried out to it. */}
        {SHARE_ANGLES.map((a, i) => {
          const d = zoomed ? 128 : 0;
          return (
            <g key={i}
              style={{
                ...t(900, zoomed ? 500 + i * 120 : 0),
                transform: `translate(${r2(C + d * Math.cos(a))}px, ${r2(C + d * Math.sin(a))}px)`,
                opacity: zoomed ? 1 : 0,
              }}
            >
              <MiniQuadrant size={30} />
            </g>
          );
        })}
      </g>

      {/* ——— The circle itself. Step 5 pulls it back to make room. ——— */}
      <g
        style={{
          ...t(900),
          transformOrigin: `${C}px ${C}px`,
          transformBox: "view-box",
          transform: zoomed ? "scale(0.4)" : "scale(1)",
        }}
      >
        {/* The toono */}
        <circle cx={C} cy={C} r={52} fill="none" stroke="var(--rule)"
          style={{ ...t(), opacity: step === 4 ? 0 : 1 }} />

        {/* Edges from everyone who joined to the thing they joined. */}
        <g stroke="var(--rule-strong)" strokeWidth="1.1">
          {EVERY_EDGE.map((i) => {
            const p = POS[i];
            const on = showNode && joined.has(i);
            return (
              <line key={i} x1={r2(p.x)} y1={r2(p.y)} x2={C} y2={C} pathLength={1}
                style={{
                  ...t(700, on ? 150 + EVERY_EDGE.indexOf(i) * 70 : 0),
                  strokeDasharray: 1,
                  strokeDashoffset: on ? 0 : 1,
                  transition: `stroke-dashoffset 700ms ${ease} ${on ? 150 + EVERY_EDGE.indexOf(i) * 70 : 0}ms`,
                }}
              />
            );
          })}
        </g>

        {/* 1 — the proposal: one person's mark, and what they asked. */}
        <line x1={r2(SPUR.x1)} y1={r2(SPUR.y1)} x2={r2(SPUR.x2)} y2={r2(SPUR.y2)}
          stroke="var(--ochre)" strokeWidth="3" strokeLinecap="round"
          style={{ ...t(), opacity: step === 1 ? 1 : 0 }} />
        <g style={{ ...t(), opacity: step === 1 ? 1 : 0, transform: step === 1 ? "translateY(0)" : "translateY(6px)" }}>
          <rect x={C - 92} y={C - 34} width={184} height={68} rx={10}
            fill="var(--card)" stroke="var(--ochre)" strokeWidth="1.2" />
          <text x={C} y={C - 12} textAnchor="middle" fill="var(--ochre)"
            style={{ font: "600 9px var(--font-body)", letterSpacing: "0.14em" }}>
            ANA ASKS
          </text>
          <text x={C} y={C + 6} textAnchor="middle" fill="var(--ink)"
            style={{ font: "italic 13px var(--font-display)" }}>
            What does our street
          </text>
          <text x={C} y={C + 22} textAnchor="middle" fill="var(--ink)"
            style={{ font: "italic 13px var(--font-display)" }}>
            need this winter?
          </text>
        </g>

        {/* 2–3 — the shared exploration, live while people are joining. */}
        <g style={{ ...t(), opacity: showNode ? 1 : 0 }}>
          <g style={{
            ...t(800),
            transformOrigin: `${C}px ${C}px`,
            transformBox: "view-box",
            transform: `scale(${nodeScale})`,
          }}>
            <circle className="pulse" cx={C} cy={C} r={1.12} fill="none" stroke="var(--sky)"
              vectorEffect="non-scaling-stroke" strokeWidth="1.5" />
            <circle cx={C} cy={C} r={1} fill="var(--card)" stroke="var(--sky)"
              vectorEffect="non-scaling-stroke" strokeWidth="1.8" />
          </g>
          <text x={C} y={C + 4} textAnchor="middle" fill="var(--sky)"
            style={{ ...t(), font: "12px var(--font-body)", opacity: step === 3 ? 1 : 0 }}>
            6 of 8
          </text>
        </g>

        {/* 4 — the picture the circle made. */}
        <g style={{
          ...t(800, step === 4 ? 200 : 0),
          opacity: step >= 4 ? 1 : 0,
          transformOrigin: `${C}px ${C}px`,
          transformBox: "view-box",
          transform: step >= 4 ? "scale(1)" : "scale(0.3)",
        }}>
          <rect x={Q.x} y={Q.y} width={Q.w} height={Q.w} rx={12}
            fill="var(--card)" stroke="var(--rope)" strokeWidth="1.2" />
          <line x1={C} y1={Q.y + 10} x2={C} y2={Q.y + Q.w - 10} stroke="var(--rule-strong)" strokeDasharray="3 4" />
          <line x1={Q.x + 10} y1={C} x2={Q.x + Q.w - 10} y2={C} stroke="var(--rule-strong)" strokeDasharray="3 4" />
          {MARKS.map((m, i) => {
            const cx = Q.x + 16 + m.x * (Q.w - 32);
            const cy = Q.y + 16 + (1 - m.y) * (Q.w - 32);
            return (
              <g key={i} style={{ ...t(500, step === 4 ? 600 + i * 90 : 0), opacity: step >= 4 ? 1 : 0 }}>
                <circle cx={r2(cx)} cy={r2(cy)} r={r2(6 + 3.4 * Math.sqrt(m.n - 1) * 1.6)}
                  fill="var(--ink-soft)" stroke="var(--card)" />
                {m.n > 1 && (
                  <text x={r2(cx)} y={r2(cy + 3.5)} textAnchor="middle" fill="var(--card)"
                    style={{ font: "10px var(--font-body)" }}>{m.n}</text>
                )}
              </g>
            );
          })}
          {/* Pole labels sit inside the frame, at the ends of their axes. */}
          <g style={{ opacity: zoomed ? 0 : 1, transition: "opacity 400ms" }}>
            <text x={Q.x + 8} y={C - 5} fill="var(--pole-a)" style={{ font: "10px var(--font-body)" }}>mend</text>
            <text x={Q.x + Q.w - 8} y={C + 13} textAnchor="end" fill="var(--pole-b)" style={{ font: "10px var(--font-body)" }}>build new</text>
            <text x={C + 5} y={Q.y + 14} fill="var(--pole-b)" style={{ font: "10px var(--font-body)" }}>whole street</text>
            <text x={C - 5} y={Q.y + Q.w - 7} textAnchor="end" fill="var(--pole-a)" style={{ font: "10px var(--font-body)" }}>just us</text>
          </g>
        </g>

        {/* The people, on the ring. */}
        {PEOPLE.map((name, i) => {
          const p = POS[i];
          const lit = joined.has(i) || step >= 4;
          const above = Math.sin(p.a) < -0.5;
          return (
            <g key={name} style={{ ...t(600, lit && step === 3 ? JOINED[3].indexOf(i) * 70 : 0), opacity: lit ? 1 : 0.45 }}>
              <circle cx={r2(p.x)} cy={r2(p.y)} r={MEMBER_R} fill="var(--card)"
                stroke={i === PROPOSER && step === 1 ? "var(--ochre)" : "var(--rule-strong)"}
                strokeWidth={i === PROPOSER && step === 1 ? 1.8 : 1.2} />
              <text x={r2(p.x)} y={r2(p.y + 4.5)} textAnchor="middle" fill="var(--ink-soft)"
                style={{ font: "13px var(--font-display)" }}>
                {initials(name)}
              </text>
              <text x={r2(p.x)} y={r2(above ? p.y - MEMBER_R - 7 : p.y + MEMBER_R + 13)}
                textAnchor="middle" fill="var(--ink-faint)"
                style={{ font: "10px var(--font-body)", opacity: zoomed ? 0 : 1, transition: "opacity 400ms" }}>
                {name}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
