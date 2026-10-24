"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BEADS, C, FIELD, FIELD_R, JOINS, LEAVES, OTHERS, PEOPLE, PLACES, ROW, SIZE, TRAVELLER, WAVE_MS, type Pt } from "@/lib/storyScene";

// The homepage story: six beats scroll past one drawing that sticks beside
// them. The drawing opens and closes on the mark; between, the same eight
// people are arranged and rearranged, and what passes between them changes.
const BEATS = 6;

const at = ([x, y]: Pt) => ({ transform: `translate(${x}px, ${y}px)` });
const shown = (on: boolean) => ({ opacity: on ? 1 : 0 });

export function Story({ startHref, libraryHref }: { startHref: string; libraryHref: string }) {
  const [beat, setBeat] = useState(1);
  const words = useRef<(HTMLDivElement | null)[]>([]);
  const pic = useRef<HTMLDivElement | null>(null);

  // Scroll-driven, measured from the words themselves, every frame, so it works
  // the same in both directions. The reading line is the middle of the space the
  // text can be read in (below the stuck drawing on phones). The beat whose
  // words sit closest to that line owns the drawing; each block brightens as it
  // nears the line.
  useEffect(() => {
    const stacked = window.matchMedia("(max-width: 820px)");
    const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    let current = 1, queued = false;
    const update = () => {
      queued = false;
      const vh = window.innerHeight;
      const top = stacked.matches && pic.current ? Math.max(0, pic.current.getBoundingClientRect().bottom) : 0;
      const line = top + (vh - top) / 2, span = (vh - top) / 2;
      let best = 0, bestD = Infinity;
      words.current.forEach((el, k) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - line);
        if (d < bestD) { bestD = d; best = k; }
        el.style.opacity = (1 - 0.7 * smooth(0.35, 1, d / span)).toFixed(3);
      });
      if (best + 1 !== current) { current = best + 1; setBeat(current); }
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    update();
    return () => { window.removeEventListener("scroll", queue); window.removeEventListener("resize", queue); };
  }, []);

  const places = PLACES[beat];
  const mark = beat === 1 || beat === BEATS;

  return (
    <section className="story">
      <div className="story-pic" ref={pic}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
          aria-label="The ferment mark; a story carried along a line of people; a field of many circles; a circle of eight around a shared middle; a web of gatherings with a question crossing it; the mark again.">
          {/* 1 and 6: the mark */}
          <g className="story-fade" style={shown(mark)}>
            <g transform="translate(108, 70) scale(6)">
              <path d="M8,52 A15,15 0 0 1 38,52" fill="none" stroke="var(--ink)" strokeWidth={5} strokeLinecap="round" />
              <path d="M26,52 A15,15 0 0 1 56,52" fill="none" stroke="var(--ink)" strokeWidth={5} strokeLinecap="round" />
              <circle cx={32} cy={26} r={4.6} fill="var(--shared)" />
              <circle cx={24} cy={14.5} r={3.3} fill="var(--shared)" />
              <circle cx={39} cy={7.5} r={3.8} fill="var(--shared)" />
            </g>
            <text className="story-wordmark" x={C} y={496} textAnchor="middle">ferment</text>
          </g>

          {/* 2: a story carried along */}
          <g className="story-fade" style={shown(beat === 2)}>
            <polyline points={ROW.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--shared)" strokeWidth={1.6} strokeDasharray="2 6" strokeLinecap="round" />
            {BEADS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={5} fill="var(--shared)" />)}
          </g>

          {/* 3: a field of circles, each with its own middle */}
          <g className="story-fade" style={shown(beat === 3)}>
            {FIELD.map((f, i) => (
              <g key={i}>
                <circle cx={f.at[0]} cy={f.at[1]} r={FIELD_R} fill="var(--shared)" stroke="var(--rule-strong)" strokeWidth={1.1} className="story-spread"
                  style={{ fillOpacity: beat === 3 ? f.spread : 0, transitionDelay: `${f.wave * WAVE_MS}ms` }} />
                {f.seats.map(([x, y], j) => <circle key={j} cx={x} cy={y} r={3.2} fill="var(--raised)" stroke="var(--rule-strong)" />)}
                <circle cx={f.at[0]} cy={f.at[1]} r={4.5} fill="var(--shared)" />
              </g>
            ))}
          </g>

          {/* 4: the circle */}
          <circle cx={C} cy={C} r={156} fill="none" stroke="var(--rule-strong)" strokeWidth={1.2} className="story-fade" style={shown(beat === 4)} />

          {/* 5: the web. Your gathering, small, among others; each holds circles. */}
          <g className="story-fade" style={shown(beat === 5)}>
            {JOINS.map(([a, b], i) => (
              <line key={i} x1={OTHERS[a].at[0]} y1={OTHERS[a].at[1]} x2={OTHERS[b].at[0]} y2={OTHERS[b].at[1]} stroke="var(--rule-strong)" strokeWidth={1} strokeDasharray="2 6" strokeLinecap="round" />
            ))}
            {OTHERS.map((o, i) => (
              <line key={i} x1={C} y1={C} x2={o.at[0]} y2={o.at[1]} stroke="var(--shared)" strokeWidth={1.3} strokeDasharray="2 6" strokeLinecap="round" />
            ))}
            {LEAVES.map(([p, q], i) => (
              <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="var(--shared)" strokeWidth={1.3} strokeDasharray="2 6" strokeLinecap="round" />
            ))}
            {OTHERS.map((o, i) => (
              <g key={i}>
                <circle cx={o.at[0]} cy={o.at[1]} r={o.r} fill="var(--ground)" stroke="var(--rule-strong)" strokeWidth={1.1} />
                {o.circles.map(([x, y], j) => (
                  <g key={j}>
                    <circle cx={x} cy={y} r={o.circleR} fill="none" stroke="var(--rule-strong)" strokeWidth={1} />
                    <circle cx={x} cy={y} r={2.4} fill="var(--shared)" />
                  </g>
                ))}
                <circle cx={o.at[0]} cy={o.at[1]} r={4.5} fill="var(--shared)" />
              </g>
            ))}
            <circle cx={C} cy={C} r={64} fill="var(--ground)" stroke="var(--rule-strong)" strokeWidth={1.2} />
            <text x={C} y={392} textAnchor="middle">your gathering</text>
          </g>

          {/* The shared middle: appears with the circle, becomes the small ring's heart in the web. */}
          <circle cx={C} cy={C} r={14} fill="var(--shared)" className="story-move"
            style={{ ...shown(beat === 4 || beat === 5), transformOrigin: `${C}px ${C}px`, transform: beat === 5 ? "scale(.7)" : "none" }} />
          {/* A question leaves your gathering and crosses the web. */}
          <circle r={7} fill="var(--shared)" className="story-move" style={{ ...shown(beat === 5), ...at(beat === 5 ? TRAVELLER : [C, C]) }} />

          {/* The eight people. The filled one is you. */}
          {Array.from({ length: PEOPLE }, (_, i) => {
            const p = places[i];
            return (
              <g key={i} className="story-move" style={{ ...shown(Boolean(p)), ...at(p ?? [C, C]) }}>
                <circle r={i === 0 ? 8 : 7} fill={i === 0 ? "var(--ink)" : "var(--raised)"} stroke="var(--ink)" strokeWidth={1.6} />
              </g>
            );
          })}
        </svg>
      </div>

      <ol className="story-beats">
        <li className="story-beat story-first">
          <div ref={(el) => { words.current[0] = el; }}>
            <h1 className="display"><span className="quiet">We make the world with our ideas.</span><span>We make our ideas with each other.</span></h1>
            <div className="story-cue mono"><i />read on</div>
          </div>
        </li>
        <li className="story-beat">
          <div ref={(el) => { words.current[1] = el; }}>
            <h2 className="display">Culture is <em className="hi">stories</em>.</h2>
            <div className="story-asks display"><span>Who are we?</span><span>What do we want?</span><span>What are we going to do about it?</span></div>
            <p>Ideas and practices that carry us through life, passed from someone to someone. Every community answers these questions in the stories it tells itself, whether it means to or not.</p>
          </div>
        </li>
        <li className="story-beat">
          <div ref={(el) => { words.current[2] = el; }}>
            <h2 className="display">Certain stories transform our world.</h2>
            <p>Most are told once and stay in the room. Science began when a few people agreed to write down what they saw and compare notes. Do that with the conversations that matter, and what one circle finds can reach a thousand.</p>
          </div>
        </li>
        <li className="story-beat">
          <div ref={(el) => { words.current[3] = el; }}>
            <h2 className="display">It starts with a <em className="hi">circle</em>.</h2>
            <p>A few people around a common centre. A question, a turn each, and the group seeing itself. It is a native form of human society, carried across time and every culture, and it holds everything from a game to a reckoning. Here it is the unit everything else is built from.</p>
          </div>
        </li>
        <li className="story-beat">
          <div ref={(el) => { words.current[4] = el; }}>
            <h2 className="display">Good questions travel.</h2>
            <p>Circles sit in gatherings, and every gathering is joined to the rest by what it passes on. A question that works at one table can reach every table, and how it goes tells the whole web what is working.</p>
          </div>
        </li>
        <li className="story-beat">
          <div ref={(el) => { words.current[5] = el; }}>
            <h2 className="display">Culture is grown in <em className="hi">conversation</em>.</h2>
            <p className="story-after display">This is where you pass it on.</p>
            <p>What you said stays with your people. What worked goes on.</p>
            <div className="home-ctas">
              <Link href={startHref} className="home-btn">Start a conversation</Link>
              <Link href={libraryHref} className="home-quiet">Browse starters</Link>
            </div>
          </div>
        </li>
      </ol>
    </section>
  );
}
