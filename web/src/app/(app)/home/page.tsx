import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { listMyArchived, listMyGatherings } from "@/domain/gatherings";
import { requireUser } from "@/lib/session";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { Top } from "@/components/app/Top";
import { setName, signOut } from "./actions";

export const metadata: Metadata = { title: "ferment" };

export default async function HomePage() {
  const me = await requireUser();
  const [mine, archived] = await Promise.all([listMyGatherings(db, me.id), listMyArchived(db, me.id)]);

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
          <h1 className="display text-4xl">Your circles and gatherings</h1>
          {mine.length === 0 ? (
            <div className="card space-y-3">
              <p>None yet. If someone has invited you, their email has your way in.</p>
              <p className="text-[var(--ink-soft)]">
                Or start one of your own: a circle for a few people around one thing, or a gathering of several circles. A circle can grow into a gathering when it&apos;s time.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {mine.map((c) => (
                <li key={c.id}>
                  <Link href={`/g/${c.slug}`} className="card flex items-center justify-between">
                    <span className="text-lg font-medium">{c.name}</span>
                    <span className="label">{c.kind === "circle" ? "circle" : ""}{c.kind === "circle" && c.role === "host" ? " · " : ""}{c.role === "host" ? "host" : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <Link href="/new" className="button">Start a circle</Link>
            <Link href="/new?kind=gathering" className="button-quiet">Host a gathering</Link>
            <Link href="/library" className="button-quiet">Browse starters</Link>
            <Link href="/library/mine" className="link self-center text-sm">Your starters</Link>
          </div>
        </section>

        {archived.length > 0 && (
          <section className="space-y-3">
            <h2 className="label">archived</h2>
            <ul className="space-y-2">
              {archived.map((c) => (
                <li key={c.id}>
                  <Link href={`/g/${c.slug}/settings`} className="link text-[var(--ink-soft)]">{c.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="flex items-center gap-4 border-t border-[var(--rule)] pt-6 text-sm text-[var(--ink-soft)]">
          <span className="mono">{me.email}</span>
          <form action={signOut}><button className="link" type="submit">Sign out</button></form>
        </footer>
      </main>
    </>
  );
}
