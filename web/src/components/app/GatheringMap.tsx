"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CSIZE, layoutGathering, type GatheringCircle, type GatheringPerson } from "@/lib/gatheringMap";

type Focus = { kind: "circle"; i: number } | { kind: "person"; id: string } | { kind: "center" } | null;
const SANS = "var(--font-hanken), system-ui, sans-serif";
const MONO = "var(--font-geist-mono), ui-monospace, monospace";

/**
 * The gathering as a circle of circles. Everyone sits on the outer ring
 * (hollow if not in a circle yet; you in beet), gathered in an arc at the top
 * over a faint ring until there are enough people to close it; circles sit inside, cored by
 * what they've explored, with a green dot while a round is open; the open
 * questions hold the center. Hover or tap to see who's where.
 */
export function GatheringMap({
  people, circles, openQuestions, answerers, viewerId, base, label, circleBase = "/g",
}: {
  people: GatheringPerson[];
  circles: GatheringCircle[];
  openQuestions: number;
  answerers: string[];
  viewerId: string;
  base: string;
  label: string;
  /** Where a circle leads, before its slug: its own address (GROUPS.md §7), unless the sample says otherwise. */
  circleBase?: string;
}) {
  const { seats, seatR, nodes, center, ringR, full } = useMemo(() => layoutGathering(people, circles), [people, circles]);
  const [hover, setHover] = useState<Focus>(null);
  const [pinned, setPinned] = useState<Focus>(null);
  const focus = pinned ?? hover;

  useEffect(() => {
    if (!pinned) return;
    const off = () => setPinned(null);
    document.addEventListener("click", off);
    return () => document.removeEventListener("click", off);
  }, [pinned]);

  const lit = (ci: number, userId: string) =>
    focus?.kind === "circle" ? focus.i === ci : focus?.kind === "person" ? focus.id === userId : false;
  const circleDim = (ci: number) =>
    focus === null ? 1
    : focus.kind === "circle" ? (focus.i === ci ? 1 : 0.45)
    : focus.kind === "person" ? (nodes[ci].members.includes(focus.id) ? 1 : 0.45)
    : 0.45;

  const handlers = (f: NonNullable<Focus>) => ({
    tabIndex: 0,
    role: "button" as const,
    onMouseEnter: () => setHover(f),
    onMouseLeave: () => setHover(null),
    onFocus: () => setHover(f),
    onBlur: () => setHover(null),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      setPinned(JSON.stringify(pinned) === JSON.stringify(f) ? null : f);
    },
  });

  let tip: { x: number; y: number; title: string; sub: string; href?: string } | null = null;
  if (focus?.kind === "circle") {
    const nd = nodes[focus.i];
    tip = {
      x: nd.x, y: nd.y - nd.r, title: nd.name,
      sub: nd.forming ? `forming · ${nd.members.length} of 4` : `${nd.members.length} people · ${nd.explored} rounds${nd.open ? " · open now" : ""}`,
      href: `${circleBase}/${nd.slug}`,
    };
  } else if (focus?.kind === "person") {
    const s = seats.find((x) => x.id === focus.id)!;
    const in_ = nodes.filter((nd) => nd.members.includes(s.id)).map((nd) => nd.name);
    tip = { x: s.x, y: s.y - seatR, title: s.id === viewerId ? `${s.name} (you)` : s.name, sub: in_.length ? in_.join(" · ") : "not in a circle yet" };
  } else if (focus?.kind === "center") {
    tip = {
      x: center.x, y: center.y - 20, title: `${openQuestions} open question${openQuestions === 1 ? "" : "s"}`,
      sub: `${answerers.length} ${answerers.length === 1 ? "person has" : "people have"} answered`, href: `${base}#questions`,
    };
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${CSIZE} ${CSIZE}`} className="mx-auto block h-auto w-full max-w-[560px]" role="group" aria-label={label}>
        {!full && (
          <circle cx={center.x} cy={center.y} r={ringR} fill="none" strokeWidth={1} style={{ stroke: "var(--rule)" }} aria-hidden />
        )}
        <g>
          {nodes.flatMap((nd, ci) =>
            nd.seats.map((s) => (
              <line
                key={`${nd.id}-${s.id}`}
                x1={s.x} y1={s.y} x2={nd.x} y2={nd.y}
                strokeWidth={1}
                style={{ stroke: "var(--ink-soft)", opacity: focus === null ? 0.12 : lit(ci, s.id) ? 0.9 : 0.04 }}
                className="cm-part"
              />
            )),
          )}
          {focus?.kind === "center" &&
            seats.filter((s) => answerers.includes(s.id)).map((s) => (
              <line key={`q-${s.id}`} x1={s.x} y1={s.y} x2={center.x} y2={center.y} strokeWidth={1} style={{ stroke: "var(--live)", opacity: 0.35 }} />
            ))}
        </g>

        {seats.map((s) => {
          const me = s.id === viewerId;
          const on = focus?.kind === "circle" && nodes[focus.i].members.includes(s.id);
          return (
            <g key={s.id} className="cm-act" aria-label={`${s.name}${me ? " (you)" : ""}`} {...handlers({ kind: "person", id: s.id })}>
              <circle
                cx={s.x} cy={s.y} r={seatR}
                strokeWidth={me ? 1.8 : s.inCircle ? 1 : 1.2}
                style={{
                  fill: s.inCircle ? "var(--raised)" : "none",
                  stroke: me ? "var(--mine)" : on ? "var(--ink)" : s.inCircle ? "var(--rule-strong)" : "var(--ink-faint)",
                }}
              />
              <circle cx={s.x} cy={s.y} r={11} fill="transparent" />
            </g>
          );
        })}

        {nodes.map((nd, ci) => (
          <g
            key={nd.id}
            className={`cm-act cm-fade tint-${nd.color ?? "saffron"}`}
            style={{ opacity: circleDim(ci) }}
            aria-label={`${nd.name}: ${nd.members.length} people${nd.forming ? ", forming" : `, ${nd.explored} rounds`}${nd.open ? ", something open now" : ""}.`}
            {...handlers({ kind: "circle", i: ci })}
          >
            {nd.forming ? (
              <circle cx={nd.x} cy={nd.y} r={nd.r} fill="none" strokeWidth={1.2} strokeDasharray="3 4" style={{ stroke: "var(--ink-faint)" }} />
            ) : (
              <>
                <circle cx={nd.x} cy={nd.y} r={nd.r} strokeWidth={1.2} style={{ fill: "var(--raised)", stroke: "var(--rule-strong)" }} />
                {nd.core > 0 && <circle cx={nd.x} cy={nd.y} r={nd.core} strokeWidth={1.2} style={{ fill: "var(--tint-soft)", stroke: "var(--tint)" }} />}
              </>
            )}
            {nd.dot && <circle cx={nd.dot.x} cy={nd.dot.y} r={4.5} strokeWidth={2} style={{ fill: "var(--live)", stroke: "var(--raised)" }} />}
            <text x={nd.x} y={nd.y + nd.r + 15} textAnchor="middle" fontFamily={SANS} fontSize={11.5} style={{ fill: "var(--ink-soft)" }}>
              {nd.name}
            </text>
          </g>
        ))}

        {openQuestions > 0 && (
          <g
            className="cm-act"
            aria-label={`${openQuestions} open question${openQuestions === 1 ? "" : "s"} to everyone`}
            {...handlers({ kind: "center" })}
          >
            <circle cx={center.x} cy={center.y} r={21} fill="none" strokeWidth={1.2} strokeOpacity={0.45} style={{ stroke: "var(--live)" }} />
            <circle cx={center.x} cy={center.y} r={16} strokeWidth={2} style={{ fill: "var(--raised)", stroke: "var(--live)" }} />
            <text x={center.x} y={center.y + 4} textAnchor="middle" fontFamily={MONO} fontSize={11} style={{ fill: "var(--live)" }}>
              {openQuestions}
            </text>
          </g>
        )}
      </svg>

      {tip && (
        <div
          className="cm-tip"
          role="status"
          onClick={(e) => e.stopPropagation()}
          style={{
            left: `${Math.min(75, Math.max(25, (tip.x / CSIZE) * 100))}%`,
            top: `${(tip.y / CSIZE) * 100}%`,
            pointerEvents: pinned ? "auto" : "none",
          }}
        >
          <b>{tip.title}</b>
          <small>{tip.sub}</small>
          {pinned && tip.href && <Link href={tip.href} className="link text-sm">Open →</Link>}
        </div>
      )}
    </div>
  );
}
