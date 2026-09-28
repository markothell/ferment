"use client";

import { useEffect, useState } from "react";

// The headline, from the notebook: "tools for ___ community", cycling through
// thinking, learning and sharing, and holding longest on becoming. The
// carousel loops until the reader scrolls, then finishes on "becoming". The
// changing words have a line of their own, so the headline is always three
// lines and nothing reflows as they change.

const VERBS = ["thinking as", "learning as", "sharing as", "becoming"];
const HOLD = 1800;
const HOLD_LAST = 5000;

export function Becoming() {
  const [i, setI] = useState(0);
  // Once the reader scrolls, the carousel plays on to "becoming" and stays.
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    const onScroll = () => { if (window.scrollY > 0) setSettling(true); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // Reduced motion: go straight to "becoming" and stay there.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if ((still || settling) && i === VERBS.length - 1) return;
    const id = setTimeout(
      () => setI((v) => (still ? VERBS.length - 1 : (v + 1) % VERBS.length)),
      still ? 0 : i === VERBS.length - 1 ? HOLD_LAST : HOLD,
    );
    return () => clearTimeout(id);
  }, [i, settling]);

  const last = i === VERBS.length - 1;

  return (
    <h1 className="text-[2.6rem] leading-[1.08] tracking-[-0.01em] sm:text-6xl">
      <span className="block">Tools for</span>
      <span className="block">
        <span className="relative inline-block">
          <span key={i} className="verb inline-block" style={{ color: last ? "var(--ink)" : "var(--ochre)" }}>
            {VERBS[i]}
          </span>
          {last && (
            <span aria-hidden className="underline-in absolute left-0 -bottom-[0.08em] h-[3px] w-full rounded-full bg-ink" />
          )}
        </span>
      </span>
      <span className="block">community.</span>
      <style>{`
        .verb { animation: verb-in .6s cubic-bezier(.2,.7,.2,1); }
        @keyframes verb-in { from { opacity: 0; transform: translateY(.25em); } to { opacity: 1; transform: none; } }
        .underline-in { transform-origin: left; animation: underline-in .7s ease .3s both; }
        @keyframes underline-in { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media (prefers-reduced-motion: reduce) { .verb, .underline-in { animation: none; } }
      `}</style>
    </h1>
  );
}
