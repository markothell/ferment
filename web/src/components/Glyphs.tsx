import { seats, r2 } from "@/lib/ring";

// Small drawings for the needs and the map key. Same marks as the big drawings,
// at the size of a word.

const S = 64;
const C = S / 2;

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} role="img" aria-label={label} className="block shrink-0">
      {children}
    </svg>
  );
}

/** Everyone gets heard: every seat holds a sealed answer of the same size. */
export function EveryVoice() {
  const ring = seats(7, C, C, 22);
  const inner = seats(7, C, C, 12);
  return (
    <Frame label="Seven seats, each with an answer of the same size">
      <circle cx={C} cy={C} r={22} fill="none" stroke="var(--rule)" />
      {ring.map((p, i) => (
        <circle key={i} cx={r2(p.x)} cy={r2(p.y)} r={5.5} fill="var(--card)" stroke="var(--rope)" strokeWidth="1.2" />
      ))}
      {inner.map((p, i) => (
        <circle key={i} cx={r2(p.x)} cy={r2(p.y)} r={2.6} fill="var(--ink-soft)" />
      ))}
    </Frame>
  );
}

/** On your own time: answers arrive one by one around the week. */
export function OwnTime() {
  const ring = seats(6, C, C, 22);
  const answered = [0, 1, 3, 4];
  return (
    <Frame label="Six seats; four have answered, at different times">
      <path d={`M ${C} ${C - 22} A 22 22 0 1 1 ${r2(C - 22 * Math.sin(Math.PI / 3))} ${r2(C - 22 * Math.cos(Math.PI / 3))}`}
        fill="none" stroke="var(--rule-strong)" strokeDasharray="2 3" />
      {ring.map((p, i) => (
        <g key={i}>
          {answered.includes(i) && (
            <line x1={r2(p.x)} y1={r2(p.y)} x2={C} y2={C} stroke="var(--rule-strong)" />
          )}
          <circle cx={r2(p.x)} cy={r2(p.y)} r={5.5} fill="var(--card)"
            stroke={answered.includes(i) ? "var(--rope)" : "var(--rule-strong)"} strokeWidth="1.2" />
        </g>
      ))}
      <circle cx={C} cy={C} r={7} fill="var(--shared)" stroke="var(--rope)" strokeWidth="1.2" />
    </Frame>
  );
}

/** See where you stand: answers placed on two axes. */
export function WhereYouStand() {
  const marks = [[44, 20, 6], [38, 28, 3.5], [20, 26, 3.5], [24, 44, 3.5], [46, 44, 3.5]];
  return (
    <Frame label="Answers placed on two axes, with one cluster">
      <rect x={8} y={8} width={48} height={48} rx={7} fill="var(--card)" stroke="var(--rope)" strokeWidth="1.2" />
      <line x1={C} y1={13} x2={C} y2={51} stroke="var(--rule-strong)" strokeDasharray="2 3" />
      <line x1={13} y1={C} x2={51} y2={C} stroke="var(--rule-strong)" strokeDasharray="2 3" />
      {marks.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="var(--ink-soft)" />)}
    </Frame>
  );
}

/** Keep what you make: the circle's record, growing over time. */
export function KeepIt() {
  const sizes = [3.5, 6, 4.5, 7.5, 5.5];
  let x = 3;
  return (
    <Frame label="A row of things explored together, kept">
      <line x1={4} y1={C} x2={60} y2={C} stroke="var(--rule)" />
      {sizes.map((r, i) => {
        x += (i === 0 ? r : sizes[i - 1] + r) + 1;
        return <circle key={i} cx={x} cy={C} r={r} fill="var(--shared)" stroke="var(--rope)" strokeWidth="1.2" />;
      })}
    </Frame>
  );
}

// ——— The map key ———

const K = 44;
const KC = K / 2;

function KeyFrame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${K} ${K}`} width={K} height={K} aria-hidden className="block shrink-0">
      {children}
    </svg>
  );
}

export function KeySeat() {
  return (
    <KeyFrame>
      <circle cx={KC} cy={KC} r={12} fill="var(--card)" stroke="var(--rule-strong)" strokeWidth="1.2" />
      <text x={KC} y={KC + 4} textAnchor="middle" fill="var(--ink-soft)" style={{ font: "11px var(--font-display)" }}>Ma</text>
    </KeyFrame>
  );
}

export function KeySpur({ queued = false }: { queued?: boolean }) {
  return (
    <KeyFrame>
      <circle cx={14} cy={KC + 6} r={9} fill="var(--card)" stroke="var(--rule-strong)" strokeWidth="1.2" />
      <line x1={21} y1={KC - 1} x2={34} y2={KC - 14} stroke="var(--ochre)" strokeWidth="2.5" strokeLinecap="round" />
      {queued && <circle cx={34} cy={KC - 14} r={3.2} fill="var(--ochre)" />}
    </KeyFrame>
  );
}

export function KeyShared() {
  return (
    <KeyFrame>
      <circle cx={13} cy={KC} r={5} fill="var(--shared)" stroke="var(--rope)" strokeWidth="1.2" />
      <circle cx={30} cy={KC} r={10} fill="var(--shared)" stroke="var(--rope)" strokeWidth="1.2" />
    </KeyFrame>
  );
}

export function KeyLive() {
  return (
    <KeyFrame>
      <circle className="pulse" cx={KC} cy={KC} r={11} fill="none" stroke="var(--sky)" strokeWidth="1.5" />
      <circle cx={KC} cy={KC} r={9} fill="var(--card)" stroke="var(--sky)" strokeWidth="1.8" />
    </KeyFrame>
  );
}
