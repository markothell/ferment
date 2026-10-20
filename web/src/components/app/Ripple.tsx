/**
 * How far a question has spread (design/ferment/archive/gathering.html).
 * Center: where it started, filled if here, hollow if it arrived from another
 * gathering. Inner ring: the share of this gathering's circles that took it
 * up (green and full when it's open to everyone). Outer ring: one tick per
 * other gathering, 15° apart; dotted while there are none.
 */
export function Ripple({
  share, everyoneOpen = false, beyond = 0, arrived = false, size = 48,
}: {
  share: number;
  everyoneOpen?: boolean;
  beyond?: number;
  arrived?: boolean;
  size?: number;
}) {
  const C = 24, r1 = 11, r2 = 19, len = 2 * Math.PI * r1;
  const frac = Math.max(0, Math.min(1, share));
  const q = (v: number) => Math.round(v * 100) / 100;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden className="shrink-0">
      {beyond === 0 ? (
        <circle cx={C} cy={C} r={r2} fill="none" strokeWidth={1} strokeDasharray="1.5 3" style={{ stroke: "var(--rule-strong)" }} />
      ) : (
        Array.from({ length: Math.min(beyond, 24) }, (_, k) => {
          const a = -Math.PI / 2 + (k * Math.PI) / 12;
          return (
            <line
              key={k}
              x1={q(C + (r2 - 2.5) * Math.cos(a))} y1={q(C + (r2 - 2.5) * Math.sin(a))}
              x2={q(C + (r2 + 2.5) * Math.cos(a))} y2={q(C + (r2 + 2.5) * Math.sin(a))}
              strokeWidth={1.6} strokeLinecap="round" style={{ stroke: "var(--ink-soft)" }}
            />
          );
        })
      )}
      <circle cx={C} cy={C} r={r1} fill="none" strokeWidth={3} style={{ stroke: "var(--rule)" }} />
      {frac > 0 && (
        <circle
          cx={C} cy={C} r={r1} fill="none" strokeWidth={3}
          strokeDasharray={`${q(frac * len)} ${q(len)}`}
          strokeLinecap={frac < 1 ? "round" : "butt"}
          transform={`rotate(-90 ${C} ${C})`}
          style={{ stroke: everyoneOpen ? "var(--live)" : "var(--shared)" }}
        />
      )}
      <circle
        cx={C} cy={C} r={3.2} strokeWidth={1.2}
        style={{ fill: arrived ? "none" : "var(--shared)", stroke: arrived ? "var(--ink-soft)" : "var(--shared)" }}
      />
    </svg>
  );
}
