/**
 * On an open question: a filled dot while it waits for you, a ring once
 * you've answered. Closed questions carry no mark. Green is live, so only
 * open questions ever show one.
 */
export function TurnDot({ open, answered }: { open: boolean; answered: boolean }) {
  if (!open) return null;
  return answered ? (
    <span className="ring-live" role="img" aria-label="you've answered" />
  ) : (
    <span className="dot-live" role="img" aria-label="waiting for your answer" />
  );
}
