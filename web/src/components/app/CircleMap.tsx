"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SEAT_R, SIZE, layoutCircle, type MapRound, type MapSeat } from "@/lib/circleMap";
import { relative } from "@/lib/time";

const VIEW_TOP = 20;
const VIEW_H = 430;
const SANS = "var(--font-hanken), system-ui, sans-serif";

function when(r: MapRound, now: Date): string {
  if (r.phase === "open") return r.closesAt ? `open now · closes ${relative(r.closesAt, now)}` : "open now";
  return r.at.toLocaleDateString("en", { month: "short", day: "numeric" });
}

/**
 * The circle map (design/ferment/previews/circle.html). Participation lines
 * always show faintly; focusing a round brings its own lines to full strength
 * and eases the others back. Seats never dim. Tap to pin a round and follow
 * it; empty seats show how many more a forming circle needs.
 */
export function CircleMap({
  seats, rounds, emptySeats = 0, roundBase, label,
}: {
  seats: MapSeat[];
  rounds: MapRound[];
  emptySeats?: number;
  /** rounds link to `${roundBase}/${id}` */
  roundBase: string;
  label: string;
}) {
  const roundHref = (id: string) => `${roundBase}/${id}`;
  const router = useRouter();
  const all = useMemo(
    () => [...seats, ...Array.from({ length: emptySeats }, (_, i) => ({ id: `empty-${i}`, name: "" }))],
    [seats, emptySeats],
  );
  const { seats: placed, nodes, spurs } = useMemo(() => layoutCircle(all, rounds), [all, rounds]);
  const [focus, setFocus] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = pinned ?? focus;

  useEffect(() => {
    if (pinned === null) return;
    const off = () => setPinned(null);
    document.addEventListener("click", off);
    return () => document.removeEventListener("click", off);
  }, [pinned]);

  const thread = nodes.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L");
  const shown = active !== null ? nodes[active] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 ${VIEW_TOP} ${SIZE} ${VIEW_H}`}
        className="mx-auto block h-auto w-full max-w-[500px]"
        role="group"
        aria-label={label}
      >
        {nodes.length > 1 && (
          <path
            d={`M${thread}`}
            fill="none"
            style={{ stroke: "var(--rule-strong)", opacity: active !== null ? 0.55 : 1 }}
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="cm-fade"
          />
        )}

        <g>
          {nodes.flatMap((n, ni) =>
            n.tellers.map((si) => (
              <line
                key={`${n.id}-${si}`}
                x1={placed[si].x} y1={placed[si].y} x2={n.x} y2={n.y}
                strokeWidth={1.4}
                style={{ stroke: n.live ? "var(--live)" : "var(--shared)", opacity: active === ni ? 1 : 0.1 }}
                className="cm-part"
              />
            )),
          )}
        </g>

        {spurs.map((s) => (
          <g key={s.round.id} className="cm-fade" style={{ opacity: active !== null ? 0.55 : 1 }}>
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} style={{ stroke: "var(--mine)" }} strokeWidth={2.5} strokeLinecap="round" />
            {s.queued && <circle cx={s.x2} cy={s.y2} r={3.5} style={{ fill: "var(--mine)" }} />}
          </g>
        ))}

        {placed.map((p) => {
          const empty = p.id.startsWith("empty-");
          return (
            <g key={p.id}>
              <circle
                cx={p.x} cy={p.y} r={SEAT_R}
                style={{ fill: empty ? "none" : "var(--raised)", stroke: "var(--rule-strong)" }}
                strokeWidth={1.2}
                strokeDasharray={empty ? "3 4" : undefined}
              />
              {!empty && (
                <>
                  <text x={p.x} y={p.y + 5} textAnchor="middle" fontFamily={SANS} fontWeight={500} fontSize={14.5} style={{ fill: "var(--ink-soft)" }}>
                    {p.initials}
                  </text>
                  <text
                    x={p.x} y={p.labelAbove ? p.y - SEAT_R - 8 : p.y + SEAT_R + 15}
                    textAnchor="middle" fontFamily={SANS} fontSize={11.5} style={{ fill: "var(--ink-faint)" }}
                  >
                    {p.name}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {nodes.map((n, ni) => (
          <g
            key={n.id}
            tabIndex={0}
            role="button"
            aria-label={`${n.question}. ${n.live ? "Open now. " : ""}${n.tellers.length} took part.`}
            className="cm-act cm-fade"
            style={{ opacity: active !== null && active !== ni ? 0.55 : 1 }}
            onMouseEnter={() => setFocus(ni)}
            onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(ni)}
            onBlur={() => setFocus(null)}
            onClick={(e) => {
              e.stopPropagation();
              setPinned(pinned === ni ? null : ni);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") router.push(roundHref(n.id));
              if (e.key === "Escape") {
                setPinned(null);
                (e.currentTarget as SVGGElement).blur();
              }
            }}
          >
            {n.live ? (
              <>
                <circle cx={n.x} cy={n.y} r={n.r + 4} fill="none" style={{ stroke: "var(--live)" }} strokeWidth={1.2} strokeOpacity={0.45} />
                <circle cx={n.x} cy={n.y} r={n.r} style={{ fill: "var(--raised)", stroke: "var(--live)" }} strokeWidth={2} />
              </>
            ) : (
              <circle cx={n.x} cy={n.y} r={n.r} style={{ fill: "var(--shared-soft)", stroke: "var(--shared)" }} strokeWidth={1.4} />
            )}
            {/* a larger, invisible target for fingers */}
            <circle cx={n.x} cy={n.y} r={Math.max(n.r, 16)} fill="transparent" />
          </g>
        ))}
      </svg>

      {shown && (
        <div
          className="cm-tip"
          role="status"
          onClick={(e) => e.stopPropagation()}
          style={{
            left: `${Math.min(75, Math.max(25, (shown.x / SIZE) * 100))}%`,
            top: `${((shown.y - shown.r - VIEW_TOP) / VIEW_H) * 100}%`,
            pointerEvents: pinned !== null ? "auto" : "none",
          }}
        >
          <b>{shown.question}</b>
          <small>
            {shown.live && <i>● </i>}
            {when(shown, new Date())} · {shown.tellers.length} took part
          </small>
          {pinned !== null && (
            <Link href={roundHref(shown.id)} className="link text-sm">Open →</Link>
          )}
        </div>
      )}
    </div>
  );
}
