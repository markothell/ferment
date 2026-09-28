"use client";

import { useActionState } from "react";
import { requestLink, type SignInState } from "./actions";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestLink, undefined);

  if (state?.sentTo) {
    return (
      <div className="space-y-4" role="status">
        <p className="text-lg">
          If <strong className="font-medium">{state.sentTo}</strong> has been invited, a sign-in link is on its way.
        </p>
        <p className="text-[var(--ink-soft)]">It works once, for 15 minutes. You can close this tab.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="block text-[var(--ink-soft)]">
        Your email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        className="field"
        placeholder="you@example.com"
      />
      {state?.error && <p className="text-[var(--mine)]">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Sending…" : "Email me a link"}
      </button>
    </form>
  );
}
