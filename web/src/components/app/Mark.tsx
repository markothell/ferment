"use client";

import { useOptimistic } from "react";

/** A small ring on someone's answer. Fills at once on tap; the server catches up. */
export function Mark({
  on, count, action, fields,
}: {
  on: boolean;
  count: number;
  action: (form: FormData) => Promise<void>;
  fields: Record<string, string>;
}) {
  const [state, flip] = useOptimistic({ on, count }, (s) => ({ on: !s.on, count: s.count + (s.on ? -1 : 1) }));
  return (
    <form
      action={async (form) => {
        flip(null);
        await action(form);
      }}
      className="flex items-center gap-2"
    >
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" className={state.on ? "mark mark-on" : "mark"} aria-pressed={state.on} aria-label="mark">
        {state.on ? "●" : "○"}
      </button>
      {state.count > 0 && <span className="mono text-xs text-[var(--ink-faint)]">{state.count}</span>}
    </form>
  );
}
