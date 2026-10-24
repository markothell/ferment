import { confirmSuggestion, declineSuggestion } from "@/app/(app)/g/[group]/actions";
import type { invitesWaiting } from "@/domain/invites";
import { relative } from "@/lib/time";
import { Form } from "./Form";

type Suggestion = Awaited<ReturnType<typeof invitesWaiting>>[number];

/** A host's "Waiting for you": people members have suggested. Nothing is sent until a host says yes. */
export function SuggestionsWaiting({ suggestions, gathering, members, maxMembers }: {
  suggestions: Suggestion[]; gathering: string; members: number; maxMembers: number;
}) {
  if (!suggestions.length) return null;
  return (
    <section id="waiting" className="scroll-mt-4 space-y-3">
      <h2 className="display text-2xl">
        Waiting for you <span className="mono text-base text-[var(--ink-faint)]">{suggestions.length}</span>
      </h2>
      <ul className="space-y-3">
        {suggestions.map((s) => {
          const fields = (
            <>
              <input type="hidden" name="gathering" value={gathering} />
              <input type="hidden" name="invite" value={s.id} />
            </>
          );
          return (
            <li key={s.id} className="card space-y-3 border-l-2 border-l-[var(--shared)]">
              <p className="font-medium">{s.by} suggests inviting {s.name}</p>
              <p className="mono text-xs text-[var(--ink-faint)]">
                {s.email} · {relative(s.createdAt)} · {members} of {maxMembers} members · lapses {relative(s.expiresAt)}
              </p>
              {s.note && <blockquote className="border-l-2 border-[var(--shared)] pl-3">{s.note}</blockquote>}
              {s.seat && (
                <p className="mono text-xs text-[var(--ink-faint)]">
                  {s.seat.status === "admitted"
                    ? `${s.seat.circle} has made room for them.`
                    : `${s.seat.circle} is deciding on a seat: ${s.seat.supports} of ${s.seat.needed}.`}
                </p>
              )}
              <div className="flex flex-wrap items-start gap-3">
                <Form action={confirmSuggestion} submit="Confirm and send" pending="Sending…" className="">{fields}</Form>
                <details className="min-w-0 flex-1">
                  <summary className="button-quiet inline-block cursor-pointer">Not now</summary>
                  <div className="pt-3">
                    <Form action={declineSuggestion} submit="Not now" pending="…" quiet>
                      {fields}
                      <label className="block space-y-2">
                        <span className="block text-sm text-[var(--ink-soft)]">A word for {s.by}, if you like. {s.name} hears nothing.</span>
                        <textarea name="note" rows={2} maxLength={500} className="field" />
                      </label>
                    </Form>
                  </div>
                </details>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
