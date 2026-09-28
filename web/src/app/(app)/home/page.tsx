import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { listMyCommunities } from "@/domain/communities";
import { hostAllowlist, normalizeEmail } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { Top } from "@/components/app/Top";
import { setName, signOut } from "./actions";

export const metadata: Metadata = { title: "ferment" };

export default async function HomePage() {
  const me = await requireUser();
  const mine = await listMyCommunities(db, me.id);
  const mayStart = hostAllowlist().has(normalizeEmail(me.email));

  return (
    <>
      <Top />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        {!me.name && (
          <section className="card space-y-4">
            <h2 className="display text-2xl">First, your name.</h2>
            <Form action={setName} submit="Save">
              <Field label="What should people call you?" name="name" autoComplete="name" required />
            </Form>
          </section>
        )}

        <section className="space-y-4">
          <h1 className="display text-4xl">Your communities</h1>
          {mine.length === 0 ? (
            <p className="text-[var(--ink-soft)]">
              {mayStart ? "None yet. Start one below." : "None yet. Ferment is invite-only: someone in a community can invite you."}
            </p>
          ) : (
            <ul className="space-y-3">
              {mine.map((c) => (
                <li key={c.id}>
                  <Link href={`/c/${c.slug}`} className="card flex items-center justify-between">
                    <span className="text-lg font-medium">{c.name}</span>
                    {c.role === "host" && <span className="label">host</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {mayStart && (
            <Link href="/new" className="button-quiet">Start a community</Link>
          )}
        </section>

        <footer className="flex items-center gap-4 border-t border-[var(--rule)] pt-6 text-sm text-[var(--ink-soft)]">
          <span className="mono">{me.email}</span>
          <form action={signOut}><button className="link" type="submit">Sign out</button></form>
        </footer>
      </main>
    </>
  );
}
