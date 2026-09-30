import type { Axis } from "@/db/schema";
import { LINE, SQUARE, lineX, squareXY } from "@/lib/placement";

type Dot = { id: string; name: string; x: number | null; y: number | null; mine: boolean };
type Stat = { mean: number; spread: number; count: number } | null;

/**
 * Where everyone stands. Each person is a dot (you in beet); the group's
 * middle is an ink ring, and its spread a soft band around it. Dots link to
 * the answer they belong to.
 */
export function PlacementResult({ axes, dots, x, y }: { axes: Axis[]; dots: Dot[]; x: Stat; y: Stat }) {
  const square = axes.length === 2;
  const placed = dots.filter((d) => d.x != null && (!square || d.y != null));
  const dot = (d: Dot) => {
    const { cx, cy } = square ? squareXY(d.x!, d.y!) : { cx: lineX(d.x!), cy: LINE.h / 2 };
    return (
      <a key={d.id} href={`#answer-${d.id}`}>
        <title>{d.mine ? "You" : d.name}</title>
        <circle cx={cx} cy={cy} r={d.mine ? 7 : 6} strokeWidth={1.5}
          style={{ fill: d.mine ? "var(--mine)" : "var(--shared-soft)", stroke: d.mine ? "var(--raised)" : "var(--shared)", opacity: 0.95 }} />
      </a>
    );
  };

  return (
    <figure className="space-y-2">
      {square && <p className="text-center text-sm text-[var(--ink-soft)]">{axes[1].poleA}</p>}
      <div className={square ? "grid grid-cols-[auto_1fr_auto] items-center gap-2" : "space-y-1"}>
        {square && <span className="text-right text-sm text-[var(--ink-soft)]">{axes[0].poleA}</span>}
        <svg
          viewBox={square ? `0 0 ${SQUARE.s} ${SQUARE.s}` : `0 0 ${LINE.w} ${LINE.h}`}
          className="block w-full"
          style={{ maxWidth: square ? 320 : undefined, margin: "0 auto" }}
          role="img"
          aria-label={`${placed.length} ${placed.length === 1 ? "person has" : "people have"} placed themselves.`}
        >
          {square ? (
            <>
              <rect x={SQUARE.pad} y={SQUARE.pad} width={SQUARE.s - 2 * SQUARE.pad} height={SQUARE.s - 2 * SQUARE.pad} rx={6}
                style={{ fill: "var(--raised)", stroke: "var(--rule-strong)" }} />
              <line x1={SQUARE.s / 2} y1={SQUARE.pad} x2={SQUARE.s / 2} y2={SQUARE.s - SQUARE.pad} style={{ stroke: "var(--rule)" }} />
              <line x1={SQUARE.pad} y1={SQUARE.s / 2} x2={SQUARE.s - SQUARE.pad} y2={SQUARE.s / 2} style={{ stroke: "var(--rule)" }} />
              {x && y && (() => {
                const { cx, cy } = squareXY(x.mean, y.mean);
                const span = SQUARE.s - 2 * SQUARE.pad;
                return (
                  <>
                    <ellipse cx={cx} cy={cy} rx={Math.max(8, x.spread * span)} ry={Math.max(8, y.spread * span)} style={{ fill: "var(--shared-soft)", opacity: 0.45 }} />
                    <circle cx={cx} cy={cy} r={9} fill="none" strokeWidth={1.8} style={{ stroke: "var(--ink)" }} />
                  </>
                );
              })()}
            </>
          ) : (
            <>
              {x && (
                <rect x={lineX(Math.max(0, x.mean - x.spread))} y={LINE.h / 2 - 9}
                  width={Math.max(4, lineX(Math.min(1, x.mean + x.spread)) - lineX(Math.max(0, x.mean - x.spread)))}
                  height={18} rx={9} style={{ fill: "var(--shared-soft)", opacity: 0.55 }} />
              )}
              <line x1={LINE.pad} y1={LINE.h / 2} x2={LINE.w - LINE.pad} y2={LINE.h / 2} strokeWidth={2} strokeLinecap="round" style={{ stroke: "var(--rule-strong)" }} />
              {x && <circle cx={lineX(x.mean)} cy={LINE.h / 2} r={9} fill="none" strokeWidth={1.8} style={{ stroke: "var(--ink)" }} />}
            </>
          )}
          {placed.filter((d) => !d.mine).map(dot)}
          {placed.filter((d) => d.mine).map(dot)}
        </svg>
        {square && <span className="text-sm text-[var(--ink-soft)]">{axes[0].poleB}</span>}
        {!square && (
          <div className="flex justify-between text-sm text-[var(--ink-soft)]">
            <span>{axes[0].poleA}</span>
            <span>{axes[0].poleB}</span>
          </div>
        )}
      </div>
      {square && <p className="text-center text-sm text-[var(--ink-soft)]">{axes[1].poleB}</p>}
      <figcaption className="mono text-center text-xs text-[var(--ink-faint)]">
        {placed.length} placed · the ring is the group&apos;s middle, the band its spread
      </figcaption>
    </figure>
  );
}
