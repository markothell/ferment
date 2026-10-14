"use client";

import { useActionState } from "react";
import { Field } from "@/components/app/Field";
import { contact } from "./actions";

/** Asks for a name and address only when you're signed out; the account answers otherwise. */
export function ContactForm({ from, max }: { from: string | null; max: number }) {
  const [state, action, pending] = useActionState(contact, undefined);
  if (state?.ok) {
    return (
      <div className="card space-y-2" role="status">
        <p className="font-medium">Got it. Thank you.</p>
        <p className="text-[var(--ink-soft)]">I read these myself, and I&rsquo;ll write back{from ? ` to ${from}` : ""}.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5">
      {from ? (
        <p className="text-sm text-[var(--ink-soft)]">
          I&rsquo;ll write back to <span className="mono">{from}</span>.
        </p>
      ) : (
        <>
          <Field label="Your name" name="name" autoComplete="name" maxLength={80} />
          <Field label="Email" name="email" type="email" autoComplete="email" required hint="Where I'll write back." />
        </>
      )}
      <Field label="Message" name="message" multiline required maxLength={max} rows={6} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {state?.error && <p className="text-[var(--mine)]" role="alert">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>{pending ? "Sending…" : "Send"}</button>
    </form>
  );
}
