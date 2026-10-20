import type { StarterContent, StarterQuestion } from "@/db/schema";
import { CircleGlyph } from "./Glyph";

// A starter's design, read before anyone uses it: the welcome, each circle
// with its questions in the order they come, and the questions to everyone.
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

export function StarterOutline({ content }: { content: StarterContent }) {
  return (
    <div className="space-y-8">
      {(content.welcomeNote || content.welcomeQuestion) && (
        <section className="space-y-3">
          <h2 className="label">the welcome</h2>
          {content.welcomeNote && <p className="whitespace-pre-line text-[var(--ink-soft)]">{content.welcomeNote}</p>}
          {content.welcomeQuestion && (
            <div className="card space-y-1">
              <p className="font-medium">{content.welcomeQuestion.question}</p>
              <p className="label">everyone who arrives answers it · tell it, by voice · answers show as they arrive</p>
            </div>
          )}
        </section>
      )}

      {content.circles.length > 0 && (
        <section className="space-y-3">
          <h2 className="label">{content.circles.length === 1 ? "a circle" : `${content.circles.length} circles`}</h2>
          {content.circles.map((c) => (
            <div key={c.key} className="card space-y-2">
              <div className="flex items-center gap-3">
                <CircleGlyph size={30} color={c.color} />
                <div className="min-w-0">
                  <h3 className="display text-2xl">{c.name}</h3>
                  {c.description && <p className="text-sm text-[var(--ink-soft)]">{c.description}</p>}
                </div>
              </div>
              {c.questions.length > 0 ? (
                <ol className="divide-y divide-[var(--rule)]">
                  {c.questions.map((q, i) => <Question key={q.key} q={q} n={i + 1} />)}
                </ol>
              ) : (
                <p className="text-sm text-[var(--ink-soft)]">No questions yet: the circle brings its own.</p>
              )}
            </div>
          ))}
          <p className="text-sm text-[var(--ink-soft)]">
            Each circle opens with its first question once four people are in. The rest wait as suggestions, and the circle takes them up when it&apos;s ready, in any order, or brings its own.
          </p>
        </section>
      )}

      {content.openQuestions.length > 0 && (
        <section className="space-y-3">
          <h2 className="label">to everyone</h2>
          <ul className="card divide-y divide-[var(--rule)] !py-0">
            {content.openQuestions.map((q) => <Question key={q.key} q={q} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
