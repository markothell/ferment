import type { StarterContent, StarterQuestion } from "@/db/schema";
import { CircleGlyph, GatheringGlyph } from "./Glyph";
import { circleAnchor, EVERYONE_ANCHOR } from "@/lib/starterAnchors";

// A starter's design, read before anyone uses it, in the order a visitor needs
// it: the questions to everyone first, since they set the gathering's frame;
// then the welcome note; then each circle, folded to its name until wanted.
// Each question says how people answer and when they see each other, plainly.

const ANSWER: Record<StarterQuestion["shape"], string> = {
  story: "tell it",
  placement: "place yourself",
  story_placement: "tell it and place it",
  words: "choose words",
};

const SEEN: Record<StarterQuestion["reveal"], string> = {
  sealed: "answers stay sealed until it closes",
  after_share: "answers show once you've shared",
  open: "answers show as they arrive",
};

function how(q: StarterQuestion): string {
  const bits = [ANSWER[q.shape]];
  if (q.telling) bits[0] += q.telling === "voice" ? ", by voice" : ", in writing";
  if (q.shape === "words") bits.push(`pick up to ${q.pickMax}${q.coinMax ? `, add ${q.coinMax} of your own` : ""}`);
  bits.push(SEEN[q.reveal]);
  if (q.timerHours) bits.push(q.timerHours % 24 === 0 ? `closes after ${q.timerHours / 24} ${q.timerHours === 24 ? "day" : "days"}` : `closes after ${q.timerHours} hours`);
  return bits.join(" · ");
}

function Question({ q, n }: { q: StarterQuestion; n?: number }) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 py-3">
      <span className="mono pt-1 text-sm text-[var(--ink-faint)]">{n ?? "·"}</span>
      <div className="space-y-1">
        <p className="font-medium">{q.question}</p>
        {q.context && <p className="text-sm text-[var(--ink-soft)]">{q.context}</p>}
        {q.axes.length > 0 && (
          <p className="text-sm text-[var(--ink-soft)]">
            {q.axes.map((a) => `${a.poleA} ↔ ${a.poleB}`).join(" · ")}
            {q.axes.length === 2 && q.placing === "quadrants" ? " · one of four corners" : ""}
          </p>
        )}
        {q.shape === "words" && <p className="text-sm text-[var(--ink-soft)]">{q.seedWords.join(", ")}</p>}
        <p className="label">{how(q)}</p>
      </div>
    </li>
  );
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function StarterOutline({ content }: { content: StarterContent }) {
  return (
    <div className="space-y-8">
      {content.openQuestions.length > 0 && (
        <section id={EVERYONE_ANCHOR} className="scroll-mt-6 space-y-3">
          <h2 className="flex items-center gap-2">
            <GatheringGlyph size={26} />
            <span className="label">to everyone · {plural(content.openQuestions.length, "question")}</span>
          </h2>
          <p className="text-sm text-[var(--ink-soft)]">
            Asked of the whole gathering, in the middle. The first is pinned there when the gathering begins.
          </p>
          <ul className="card divide-y divide-[var(--rule)] !py-0">
            {content.openQuestions.map((q) => <Question key={q.key} q={q} />)}
          </ul>
        </section>
      )}

      {content.welcomeNote && (
        <details className="fold card">
          <summary>
            <span className="label">the welcome note</span>
            <span className="fold-chev" aria-hidden>›</span>
          </summary>
          <p className="whitespace-pre-line pt-3 text-[var(--ink-soft)]">{content.welcomeNote}</p>
        </details>
      )}

      {content.circles.length > 0 && (
        <section className="space-y-3">
          <h2 className="label">{content.circles.length === 1 ? "a circle" : `${content.circles.length} circles`}</h2>
          {content.circles.map((c) => (
            <details key={c.key} id={circleAnchor(c.key)} className="fold card scroll-mt-6">
              <summary>
                <CircleGlyph size={30} color={c.color} />
                <span className="min-w-0 flex-1">
                  <span className="display block text-2xl">{c.name}</span>
                  <span className="mono text-xs text-[var(--ink-faint)]">{plural(c.questions.length, "question")}</span>
                </span>
                <span className="fold-chev" aria-hidden>›</span>
              </summary>
              <div className="space-y-2 pt-3">
                {c.description && <p className="text-sm text-[var(--ink-soft)]">{c.description}</p>}
                {c.questions.length > 0 ? (
                  <ol className="divide-y divide-[var(--rule)]">
                    {c.questions.map((q, i) => <Question key={q.key} q={q} n={i + 1} />)}
                  </ol>
                ) : (
                  <p className="text-sm text-[var(--ink-soft)]">No questions yet: the circle brings its own.</p>
                )}
              </div>
            </details>
          ))}
          <p className="text-sm text-[var(--ink-soft)]">
            Each circle opens with its first question once four people are in. The rest wait as suggestions, and the circle takes them up when it&apos;s ready, in any order, or brings its own.
          </p>
        </section>
      )}
    </div>
  );
}
