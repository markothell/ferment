"use client";

import { useEffect, useRef, useState } from "react";
import { CENTER, RING, SIZE, TOPICS, growScene, type Pt } from "@/lib/growScene";

// Five steps told at the scale of people, not screens. The drawing sticks while
// the steps scroll past; whichever step sits in the middle of the screen sets it.
const STEPS = [
  {
    title: "Invite your people.",
    body: "Start with the people you already talk to. Every invitation comes from someone you know, and they bring in the people they know.",
  },
  {
    title: "Pick what matters.",
    body: "Bring a topic from your own life, or begin from a starter: circles and questions that other gatherings have already used and loved.",
  },
  {
    title: "Gather in circles.",
    body: "Four to twelve people around one topic. One circle works through the early years with small kids. Another gets honest about money.",
  },
  {
    title: "Share with the gathering.",
    body: "When a circle is ready, it passes what it found to everyone else. The whole gathering learns from each small table.",
  },
  {
    title: "Pass it on.",
    body: "Good conversations travel to other gatherings growing the same way. What you said stays with your people. The question goes on.",
  },
];

const SCENE = growScene();
const at = ([x, y]: Pt) => ({ transform: `translate(${x}px, ${y}px)` });
const shown = (on: boolean) => ({ opacity: on ? 1 : 0 });
const SANS = "var(--font-hanken), system-ui, sans-serif";

export function HowItGrows() {
  const [step, setStep] = useState(1);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step)); }),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const place = step === 1 ? "invited" : step === 2 ? "ring" : "circle";

  return (
    <section className="grow">
      <div className="grow-pic">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
          aria-label="People invite people, meet as a gathering, form small circles around topics, share what they find to the middle, and the gathering becomes one of many.">
          {/* Other gatherings, joined by what travels */}
          <g className="grow-fade" style={shown(step === 5)}>
            {SCENE.others.map((o, k) => (
              <g key={k}>
                <line x1={CENTER} y1={CENTER} x2={o.at[0]} y2={o.at[1]} stroke="var(--shared)" strokeWidth={1.4} strokeDasharray="2 5" strokeLinecap="round" />
                <circle cx={o.at[0]} cy={o.at[1]} r={o.r} fill="var(--ground)" stroke="var(--rule-strong)" strokeWidth={1.1} />
                {o.circles.map(([x, y], j) => <circle key={j} cx={x} cy={y} r={o.seat} fill="none" stroke="var(--rule-strong)" />)}
                <circle cx={o.at[0]} cy={o.at[1]} r={4.5} fill="var(--shared)" />
              </g>
            ))}
          </g>

          {/* This gathering. It shrinks to one among many in the last step. */}
          <g className="grow-move" style={{ transformOrigin: `${CENTER}px ${CENTER}px`, transform: step === 5 ? "scale(.42)" : "none" }}>
            <circle cx={CENTER} cy={CENTER} r={RING} fill="var(--ground)" fillOpacity={step === 5 ? 1 : 0}
              stroke="var(--rule-strong)" strokeWidth={1.2} className="grow-fade" style={shown(step >= 2)} />

            <g className="grow-fade" style={shown(step === 1)}>
              {SCENE.people.map((p, i) => {
                if (p.invitedBy < 0) return null;
                const q = SCENE.people[p.invitedBy].invited;
                return <line key={i} x1={q[0]} y1={q[1]} x2={p.invited[0]} y2={p.invited[1]} stroke="var(--rule-strong)" strokeWidth={1.2} />;
              })}
            </g>

            <g className="grow-fade" style={shown(step === 2)}>
              {TOPICS.map((t) => {
                const w = t.label.length * 7 + (t.library ? 40 : 24);
                const [x, y] = t.at;
                const bx = x - w / 2 + 14, by = y - 5;
                return (
                  <g key={t.label}>
                    <rect x={x - w / 2} y={y - 15} width={w} height={30} rx={15} fill="var(--raised)" stroke="var(--rule)" />
                    {t.library && (
                      <path d={`M${bx},${by} q5,-2 10,1 v10 q-5,-3 -10,-1 z M${bx + 10},${by + 1} q5,-3 10,-1 v10 q-5,-2 -10,1 z`}
                        fill="none" stroke="var(--shared)" strokeWidth={1.3} strokeLinejoin="round" />
                    )}
                    <text x={x + (t.library ? 9 : 0)} y={y + 4.5} textAnchor="middle" fontSize={13} fill="var(--ink)" style={{ fontFamily: SANS }}>{t.label}</text>
                  </g>
                );
              })}
            </g>

            <g className="grow-fade" style={shown(step >= 3)}>
              {SCENE.circles.map((c) => (
                <g key={c.name}>
                  <circle cx={c.at[0]} cy={c.at[1]} r={c.r} fill="none" stroke="var(--rule-strong)" strokeWidth={1.2} />
                  <circle cx={c.at[0]} cy={c.at[1]} r={7} fill="var(--shared-soft)" stroke="var(--shared)" strokeWidth={1.4} />
                  <text x={c.at[0]} y={c.at[1] + c.r + 22} textAnchor="middle" fontSize={13} fill="var(--ink-soft)" style={{ fontFamily: SANS }}>{c.name}</text>
                </g>
              ))}
            </g>

            {/* What each circle shares travels to the middle */}
            <g className="grow-fade" style={shown(step === 4)}>
              {SCENE.circles.map((c) => (
                <line key={c.name} x1={c.at[0]} y1={c.at[1]} x2={CENTER} y2={CENTER} stroke="var(--shared)" strokeWidth={1.4} strokeDasharray="2 5" strokeLinecap="round" />
              ))}
            </g>
            {SCENE.circles.map((c) => (
              <g key={c.name} className="grow-move" style={{ ...at(step === 4 ? [CENTER, CENTER] : c.at), ...shown(step === 4) }}>
                <circle r={6} fill="var(--shared)" />
              </g>
            ))}
            <circle cx={CENTER} cy={CENTER} r={16} fill="var(--shared)" className="grow-fade" style={shown(step >= 4)} />

            {SCENE.people.map((p, i) => (
              <g key={i} className="grow-move" style={at(p[place])}>
                <circle r={i === 0 ? 7 : 6} fill={i === 0 ? "var(--ink)" : "var(--raised)"} stroke="var(--ink)" strokeWidth={1.5} />
              </g>
            ))}
          </g>
        </svg>
      </div>

      <ol className="grow-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="grow-step" data-step={i + 1} ref={(el) => { refs.current[i] = el; }}>
            <div style={{ opacity: step === i + 1 ? 1 : 0.3 }}>
              <span className="mono grow-n">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="display">{s.title}</h3>
              <p>{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
