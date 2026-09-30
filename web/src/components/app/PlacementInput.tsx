"use client";

import { useRef, useState } from "react";
import type { Axis } from "@/db/schema";
import { LINE, SQUARE, lineX, q2, snapQuadrant, squareXY } from "@/lib/placement";

/**
 * Place yourself: tap or drag on the line (or in the square). Arrow keys move
 * the mark. The position travels in hidden x / y inputs with the form.
 */
export function PlacementInput({
  axes, placing, initial,
}: {
  axes: Axis[];
  placing: "free" | "quadrants" | null;
  initial: { x: number | null; y: number | null } | null;
}) {
  const square = axes.length === 2;
  const quad = square && placing === "quadrants";
  const [pos, setPos] = useState<{ x: number; y: number } | null>(
    initial?.x != null ? { x: initial.x, y: initial.y ?? 0.5 } : null,
  );
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  function fromPointer(e: React.PointerEvent) {
    const r = svg.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    if (square) {
      const scale = SQUARE.s / r.width;
      let x = clamp(((e.clientX - r.left) * scale - SQUARE.pad) / (SQUARE.s - 2 * SQUARE.pad));
      let y = clamp(((e.clientY - r.top) * scale - SQUARE.pad) / (SQUARE.s - 2 * SQUARE.pad));
      if (quad) { x = snapQuadrant(x); y = snapQuadrant(y); }
      setPos({ x: q2(x), y: q2(y) });
    } else {
      const scale = LINE.w / r.width;
      setPos({ x: q2(clamp(((e.clientX - r.left) * scale - LINE.pad) / (LINE.w - 2 * LINE.pad))), y: 0.5 });
    }
  }

  function onKey(e: React.KeyboardEvent) {
    const step = quad ? 0.5 : e.shiftKey ? 0.1 : 0.02;
    const p = pos ?? { x: 0.5, y: 0.5 };
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = move[e.key];
    if (!d || (!square && d[1] !== 0)) return;
    e.preventDefault();
    const c = (v: number) => q2(Math.min(quad ? 0.75 : 1, Math.max(quad ? 0.25 : 0, v)));
    setPos({ x: c(p.x + d[0]), y: square ? c(p.y + d[1]) : 0.5 });
  }

  const label = pos
    ? square
      ? `Your place: ${Math.round(pos.x * 100)}% toward ${axes[0].poleB}, ${Math.round(pos.y * 100)}% toward ${axes[1].poleB}`
      : `Your place: ${Math.round(pos.x * 100)}% of the way from ${axes[0].poleA} to ${axes[0].poleB}`
    : "Not placed yet";

  const handlers = {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); },
    onPointerMove: (e: React.PointerEvent) => { if (dragging.current) fromPointer(e); },
    onPointerUp: () => { dragging.current = false; },
  };

  return (
    <div className="space-y-2">
      {pos && <input type="hidden" name="x" value={pos.x} />}
      {pos && square && <input type="hidden" name="y" value={pos.y} />}
      {!pos && <input type="hidden" name="x" value="" />}

      {square && <p className="text-center text-sm text-[var(--ink-soft)]">{axes[1].poleA}</p>}
      <div className={square ? "grid grid-cols-[auto_1fr_auto] items-center gap-2" : "space-y-1"}>
        {square && <span className="text-right text-sm text-[var(--ink-soft)]">{axes[0].poleA}</span>}
        <svg
          ref={svg}
          viewBox={square ? `0 0 ${SQUARE.s} ${SQUARE.s}` : `0 0 ${LINE.w} ${LINE.h}`}
          className="block w-full touch-none select-none"
          style={{ maxWidth: square ? 320 : undefined, margin: "0 auto" }}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuetext={label}
          onKeyDown={onKey}
          {...handlers}
        >
          {square ? (
            <>
              <rect x={SQUARE.pad} y={SQUARE.pad} width={SQUARE.s - 2 * SQUARE.pad} height={SQUARE.s - 2 * SQUARE.pad} rx={6}
                style={{ fill: "var(--raised)", stroke: "var(--rule-strong)" }} />
              <line x1={SQUARE.s / 2} y1={SQUARE.pad} x2={SQUARE.s / 2} y2={SQUARE.s - SQUARE.pad} style={{ stroke: "var(--rule)" }} />
              <line x1={SQUARE.pad} y1={SQUARE.s / 2} x2={SQUARE.s - SQUARE.pad} y2={SQUARE.s / 2} style={{ stroke: "var(--rule)" }} />
              {pos && (() => { const { cx, cy } = squareXY(pos.x, pos.y); return <circle cx={cx} cy={cy} r={10} strokeWidth={3} style={{ fill: "var(--mine)", stroke: "var(--raised)" }} />; })()}
            </>
          ) : (
            <>
              <line x1={LINE.pad} y1={LINE.h / 2} x2={LINE.w - LINE.pad} y2={LINE.h / 2} strokeWidth={3} strokeLinecap="round" style={{ stroke: "var(--rule-strong)" }} />
              {[0, 0.5, 1].map((t) => (
                <line key={t} x1={lineX(t)} y1={LINE.h / 2 - 6} x2={lineX(t)} y2={LINE.h / 2 + 6} strokeWidth={1.5} style={{ stroke: "var(--rule-strong)" }} />
              ))}
              {pos && <circle cx={lineX(pos.x)} cy={LINE.h / 2} r={10} strokeWidth={3} style={{ fill: "var(--mine)", stroke: "var(--raised)" }} />}
            </>
          )}
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
      <p className="text-center text-xs text-[var(--ink-faint)]">{pos ? "Drag to move, or use the arrow keys." : quad ? "Tap the corner that fits." : "Tap where you stand."}</p>
    </div>
  );
}
