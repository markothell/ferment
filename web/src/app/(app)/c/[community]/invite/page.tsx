import type { Metadata } from "next";
import { db } from "@/db";
import { communityHome } from "@/domain/communities";
import { mySuggestions } from "@/domain/invites";
import { loadCommunity } from "@/lib/community";
import { relative } from "@/lib/time";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { Top } from "@/components/app/Top";
import { invite, withdrawSuggestion } from "../actions";

export const metadata: Metadata = { title: "Invite · ferment" };

export default async function InvitePage({ params }: PageProps<"/c/[community]/invite">) {
  const { me, community, isHost } = await loadCommunity((await params).community);
  const [home, waiting] = await Promise.all([communityHome(db, community, me.id), mySuggestions(db, community.id, me.id)]);
  const mine = home.circles.filter((c) => c.isMember);

  return (
    <>
      <Top trail={[{ label: community.name, href: `/c/${community.slug}` }, { label: isHost ? "Invite" : "Suggest someone" }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="display text-4xl">{isHost ? "Invite someone" : "Suggest someone"}</h1>
          <p className="text-[var(--ink-soft)]">
            {isHost
              ? "The invitation comes from you and goes out now."
              : "A host confirms before anything is sent. The invitation still comes from you."}{" "}
            Name one of your circles and it will be asked to make room for them.
          </p>
        </div>
        <Form action={invite} submit={isHost ? "Send invitation" : "Suggest them"} pending={isHost ? "Sending…" : "Suggesting…"}>
          <input type="hidden" name="community" value={community.slug} />
          <Field label="Their name" name="name" required maxLength={60} autoComplete="off" />
          <Field label="Their email" name="email" type="email" required autoComplete="off" hint="Only hosts see this." />
          {mine.length > 0 && (
            <label className="block space-y-2">
              <span className="block font-medium">Into one of your circles?</span>
              <select name="circle" className="field">
                <option value="">Just the community</option>
                {mine.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          <Field label="A note from you" name="note" multiline maxLength={500} placeholder="Optional" />
        </Form>

        {waiting.length > 0 && (
          <section className="space-y-3 border-t border-[var(--rule)] pt-6">
            <h2 className="display text-2xl">Your suggestions</h2>
            <ul className="space-y-3">
              {waiting.map((s) => (
                <li key={s.id} className="card space-y-2">
                  <p className="font-medium">{s.name}</p>
                  <p className="mono text-xs text-[var(--ink-faint)]">
                    waiting for a host · suggested {relative(s.createdAt)} · lapses {relative(s.expiresAt)}
                    {s.seat && ` · ${s.seat.circle}: ${s.seat.status === "admitted" ? "room made" : `${s.seat.supports} of ${s.seat.needed}`}`}
                  </p>
                  <Form action={withdrawSuggestion} submit="Withdraw" quiet className="">
                    <input type="hidden" name="community" value={community.slug} />
                    <input type="hidden" name="invite" value={s.id} />
                  </Form>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
