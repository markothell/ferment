"use client";

import { useActionState, useState } from "react";

type State = { error?: string; ok?: string } | undefined;

/** Something that asks first, on the page: one tap to ask, a second to do it. Deletes by default, which can't be undone. */
export function ConfirmForm({
  action,
  submit,
  confirm,
  yes = "Yes, delete it",
  doing = "Deleting…",
  final = true,
  children,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  submit: string;
  /** What happens, said plainly: "This deletes the question for good." */
  confirm: string;
  yes?: string;
  doing?: string;
  /** Can't be undone: says so. */
  final?: boolean;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="button-quiet" onClick={() => setAsking(true)}>
        {submit}
      </button>
    );
  }
  return (
    <form action={formAction} className="space-y-2" role="group" aria-label={submit}>
      {children}
      <p className="text-sm">{confirm}{final && " It can't be undone."}</p>
      {state?.error && <p className="text-[var(--mine)]" role="alert">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="button" disabled={pending}>{pending ? doing : yes}</button>
        <button type="button" className="button-quiet" onClick={() => setAsking(false)} disabled={pending}>Keep it</button>
      </div>
    </form>
  );
}
