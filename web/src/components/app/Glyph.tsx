import type { CircleColor } from "@/lib/circleColors";

// Page icons drawn from the gathering map's own shapes, so moving between
// pages teaches the map: the gathering is a ring of people round a center;
// a circle is a circle with its core.

export function GatheringGlyph({ size = 40 }: { size?: number }) {
  const dots = Array.from({ length: 10 }, (_, k) => {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / 10;
    return { x: 20 + 15 * Math.cos(a), y: 20 + 15 * Math.sin(a) };
  });
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden className="shrink-0">
      {dots.map((d, k) => (
        <circle key={k} cx={Math.round(d.x * 100) / 100} cy={Math.round(d.y * 100) / 100} r={3.1} strokeWidth={1.4} style={{ fill: "var(--raised)", stroke: "var(--ink-soft)" }} />
      ))}
      <circle cx={20} cy={20} r={4.6} strokeWidth={2.2} style={{ fill: "none", stroke: "var(--live)" }} />
    </svg>
  );
}

export function CircleGlyph({ size = 40, forming = false, color = "saffron" }: { size?: number; forming?: boolean; color?: CircleColor }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden className={`tint-${color} shrink-0`}>
      {forming ? (
        <circle cx={20} cy={20} r={17} fill="none" strokeWidth={1.4} strokeDasharray="3 4" style={{ stroke: "var(--ink-faint)" }} />
      ) : (
        <>
          <circle cx={20} cy={20} r={17} strokeWidth={1.4} style={{ fill: "var(--raised)", stroke: "var(--rule-strong)" }} />
          <circle cx={20} cy={20} r={10} strokeWidth={1.4} style={{ fill: "var(--tint-soft)", stroke: "var(--tint)" }} />
        </>
      )}
    </svg>
  );
}
