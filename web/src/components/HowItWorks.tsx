"use client";

import { useEffect, useRef, useState } from "react";
import { CircleScene, type Step } from "./CircleScene";

// Scroll-told: the drawing stays put and each paragraph, as it crosses the
// middle of the screen, moves the drawing to its step.

const STEPS: { n: Step; title: string; body: string }[] = [
  {
    n: 1,
    title: "Someone asks.",
    body: "Anyone in the circle can put forward an idea, a topic, or a question they want to think through. It starts as theirs alone — a single mark at their seat.",
  },
  {
    n: 2,
    title: "Someone joins, and it enters the circle.",
    body: "The moment a second person answers, it moves into the middle. It isn't one person's question any more. It's something you're exploring together.",
  },
  {
    n: 3,
    title: "The more who join, the bigger it gets.",
    body: "Everyone answers on their own time, and nobody sees the others' answers until theirs is in — so the quiet voices count as much as the quick ones.",
  },
  {
    n: 4,
    title: "Each circle makes a picture.",
    body: "When it closes, every answer is revealed at once, as something you can read at a glance: where you agree, where you're spread out, who's off on their own.",
  },
  {
    n: 5,
    title: "And it's shared back to the community.",
    body: "What a circle finds doesn't scroll away in a group chat. It's kept, and carried out to the wider community — so a neighborhood, a congregation or a team can see what its circles are learning.",
  },
];

export function HowItWorks() {
  const [step, setStep] = useState<Step>(1);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step) as Step);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section id="how" className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 md:grid md:grid-cols-[1fr_1.15fr] md:gap-16">
      {/* The drawing. On phones it pins to the top and the words scroll beneath it. */}
      <div className="sticky top-0 z-10 -mx-4 flex h-[46vh] items-center justify-center bg-ground px-4 pt-3 pb-2 sm:-mx-6 md:order-2 md:mx-0 md:h-screen md:self-start md:bg-transparent md:p-0">
        <div className="aspect-square h-full max-h-[34rem] md:h-auto md:w-full">
          <CircleScene step={step} />
        </div>
        <ol className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-2 md:bottom-10" aria-hidden>
          {STEPS.map((s) => (
            <li key={s.n} className="h-1.5 w-6 rounded-full transition-colors duration-500"
              style={{ background: s.n === step ? "var(--ink)" : "var(--rule-strong)" }} />
          ))}
        </ol>
      </div>

      <div className="md:order-1">
        {STEPS.map((s, i) => (
          <div
            key={s.n}
            ref={(el) => { refs.current[i] = el; }}
            data-step={s.n}
            className="flex min-h-[62vh] items-center md:min-h-screen"
          >
            <div className="max-w-md transition-opacity duration-500" style={{ opacity: step === s.n ? 1 : 0.35 }}>
              <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-ink-faint uppercase">
                {String(s.n).padStart(2, "0")} / 05
              </p>
              <h3 className="text-3xl leading-tight md:text-[2.2rem]">{s.title}</h3>
              <p className="mt-4 text-[17px] leading-relaxed text-ink-soft">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
