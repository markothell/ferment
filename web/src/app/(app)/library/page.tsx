import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { library } from "@/domain/starters";
import { currentSession } from "@/lib/auth";
import { StarterCard } from "@/components/app/StarterCard";
import { Top } from "@/components/app/Top";

export const metadata: Metadata = { title: "Starters · ferment" };

// The library (STARTERS.md §3, §5): published starters, open to anyone,
// signed in or not. The homepage's second way in.
export default async function LibraryPage() {
  const [starters, session] = await Promise.all([library(db), currentSession()]);
  return (
    <>
      <Top trail={[{ label: "Starters" }]} links={session ? [{ label: "Your starters", href: "/library/mine" }] : [{ label: "Sign in", href: "/signin?next=/library" }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-3">
          <h1 className="display text-4xl">Starters</h1>
          <p className="text-[var(--ink-soft)]">
            A starter is a gathering ready to begin: a welcome, a few circles, and the questions they open with. Look through one,
            start your own gathering from it, and change anything before you invite a soul.
          </p>
        </div>

        {starters.length === 0 ? (
          <p className="text-[var(--ink-soft)]">Nothing on the shelf yet.</p>
        ) : (
          <ul className="space-y-3">
            {starters.map((s) => <li key={s.id}><StarterCard s={s} /></li>)}
          </ul>
        )}

        <section className="grid gap-3 border-t border-[var(--rule)] pt-8 sm:grid-cols-2">
          <Link href="/demo/gathering" className="card block space-y-1">
            <span className="block font-medium">See a gathering in motion →</span>
            <span className="block text-sm text-[var(--ink-soft)]">Hillside Tables, an example: its circles, and the rounds they&apos;ve shared.</span>
          </Link>
          <Link href="/new" className="card block space-y-1">
            <span className="block font-medium">Start from nothing →</span>
            <span className="block text-sm text-[var(--ink-soft)]">A name and a welcome note. Add circles and questions as you go.</span>
          </Link>
        </section>
      </main>
    </>
  );
}
