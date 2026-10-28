"use client";

import { useEffect, useState } from "react";
import type { StarterContent } from "@/db/schema";
import { circleAnchor, EVERYONE_ANCHOR } from "@/lib/starterAnchors";

// A starter drawn as the gathering it becomes, in the gathering map's own
// shapes: its circles round the middle, each with its core in its colour, a
// dashed line from each to the middle where the questions to everyone sit, and
// a faint ring where people will come to sit. Hover or tap a circle or the
// middle for what it holds; a pinned tip opens that part of the outline below.

type Focus = { kind: "circle"; i: number } | { kind: "center" } | null;
const W = 480, H = 420, CX = 240, CY = 210;
const RING = 188;   // where people will sit
const AT = 122;     // circles' distance from the middle
const R = 34;       // a circle
const SANS = "var(--font-hanken), system-ui, sans-serif";
const MONO = "var(--font-geist-mono), ui-monospace, monospace";
const q = (v: number) => Math.round(v * 100) / 100;

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function StarterMap({ content, label }: { content: StarterContent; label: string }) {
  const circles = content.circles;
  const open = content.openQuestions;
  const n = circles.length;
  const nodes = circles.map((c, k) => {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / Math.max(n, 1);
    return { ...c, x: q(CX + AT * Math.cos(a)), y: q(CY + AT * Math.sin(a)) };
  });

  const [hover, setHover] = useState<Focus>(null);
  const [pinned, setPinned] = useState<Focus>(null);
  const focus = pinned ?? hover;

  useEffect(() => {
    if (!pinned) return;
    const off = () => setPinned(null);
    document.addEventListener("click", off);
    return () => document.removeEventListener("click", off);
  }, [pinned]);

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

  // Opens that part of the outline and goes to it.
  const read = (id: string) => {
    const el = document.getElementById(id);
    if (el instanceof HTMLDetailsElement) el.open = true;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPinned(null);
  };

  let tip: { x: number; y: number; title: string; sub: string; id: string } | null = null;
  if (focus?.kind === "circle") {
    const nd = nodes[focus.i];
    tip = {
      x: nd.x, y: nd.y - R, title: nd.name, id: circleAnchor(nd.key),
      sub: [plural(nd.questions.length, "question"), nd.description && clip(nd.description, 90)].filter(Boolean).join(" · "),
    };
  } else if (focus?.kind === "center") {
    tip = {
      x: CX, y: CY - 20, title: `${plural(open.length, "question")} to everyone`, id: EVERYONE_ANCHOR,
      sub: open[0] ? `first: ${clip(open[0].question, 90)}` : "",
    };
  }
  const dim = (i: number) => (focus === null ? 1 : focus.kind === "circle" && focus.i === i ? 1 : 0.45);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[480px]" role="group" aria-label={label}>
        <circle cx={CX} cy={CY} r={RING} fill="none" strokeWidth={1} style={{ stroke: "var(--rule)" }} aria-hidden />
        {nodes.map((nd, i) => (
          <line
            key={nd.key} x1={nd.x} y1={nd.y} x2={CX} y2={CY}
            strokeWidth={1.2} strokeDasharray="2 5" strokeLinecap="round" className="cm-part"
            style={{ stroke: "var(--shared)", opacity: focus === null ? 0.5 : focus.kind === "circle" && focus.i === i ? 1 : 0.15 }}
          />
        ))}
        {nodes.map((nd, i) => (
          <g
            key={nd.key}
            className={`cm-act cm-fade tint-${nd.color}`}
            style={{ opacity: dim(i) }}
            aria-label={`${nd.name}: ${plural(nd.questions.length, "question")}.`}
            {...handlers({ kind: "circle", i })}
          >
            <circle cx={nd.x} cy={nd.y} r={R} strokeWidth={1.2} style={{ fill: "var(--raised)", stroke: "var(--rule-strong)" }} />
            <circle cx={nd.x} cy={nd.y} r={R * 0.55} strokeWidth={1.2} style={{ fill: "var(--tint-soft)", stroke: "var(--tint)" }} />
            <text x={nd.x} y={nd.y + R + 16} textAnchor="middle" fontFamily={SANS} fontSize={12} style={{ fill: "var(--ink-soft)" }}>
              {nd.name}
            </text>
          </g>
        ))}
        {open.length > 0 ? (
          <g className="cm-act" aria-label={`${plural(open.length, "question")} to everyone.`} {...handlers({ kind: "center" })}>
            <circle cx={CX} cy={CY} r={23} fill="none" strokeWidth={1.2} strokeOpacity={0.45} style={{ stroke: "var(--live)" }} />
            <circle cx={CX} cy={CY} r={17} strokeWidth={2} style={{ fill: "var(--raised)", stroke: "var(--live)" }} />
            <text x={CX} y={CY + 4} textAnchor="middle" fontFamily={MONO} fontSize={12} style={{ fill: "var(--live)" }}>{open.length}</text>
          </g>
        ) : (
          <circle cx={CX} cy={CY} r={9} style={{ fill: "var(--shared)" }} aria-hidden />
        )}
      </svg>

      {tip && (
        <div
          className="cm-tip"
          role="status"
          onClick={(e) => e.stopPropagation()}
          style={{ left: `${Math.min(75, Math.max(25, (tip.x / W) * 100))}%`, top: `${(tip.y / H) * 100}%`, pointerEvents: pinned ? "auto" : "none" }}
        >
          <b>{tip.title}</b>
          {tip.sub && <small>{tip.sub}</small>}
          {pinned && <button type="button" className="link text-left text-sm" onClick={() => read(tip!.id)}>Read →</button>}
        </div>
      )}
    </div>
  );
}
