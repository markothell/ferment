"use client";

import { useActionState } from "react";

type State = { error?: string; ok?: string } | undefined;

/** A form bound to a server action returning { error } or { ok }. */
export function Form({
  action,
  submit,
  pending: pendingLabel,
  children,
  className = "space-y-4",
  quiet = false,
  buttonClass,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  submit: string;
  pending?: string;
  children?: React.ReactNode;
  className?: string;
  quiet?: boolean;
  buttonClass?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p className="text-[var(--mine)]" role="alert">{state.error}</p>}
      {state?.ok && <p className="text-[var(--ink-soft)]" role="status">{state.ok}</p>}
      <button type="submit" className={buttonClass ?? (quiet ? "button-quiet" : "button")} disabled={pending}>
        {pending && pendingLabel ? pendingLabel : submit}
      </button>
    </form>
  );
}
