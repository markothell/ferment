import type { Metadata } from "next";
import { db } from "@/db";
import { communityHome } from "@/domain/communities";
import { loadCommunity } from "@/lib/community";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { Top } from "@/components/app/Top";
import { invite } from "../actions";

export const metadata: Metadata = { title: "Invite · ferment" };

export default async function InvitePage({ params }: PageProps<"/c/[community]/invite">) {
  const { me, community } = await loadCommunity((await params).community);
  const home = await communityHome(db, community, me.id);
  const mine = home.circles.filter((c) => c.isMember);

  return (
    <>
      <Top here={{ label: community.name, href: `/c/${community.slug}` }} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="display text-4xl">Invite someone</h1>
          <p className="text-[var(--ink-soft)]">
            The invitation comes from you. Name one of your circles and they&apos;ll join it when they arrive.
          </p>
        </div>
        <Form action={invite} submit="Send invitation">
          <input type="hidden" name="community" value={community.slug} />
          <Field label="Their email" name="email" type="email" required autoComplete="off" />
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
      </main>
    </>
  );
}
