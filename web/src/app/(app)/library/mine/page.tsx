import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { myStarters } from "@/domain/starters";
import { requireUser } from "@/lib/session";
import { StarterCard } from "@/components/app/StarterCard";
import { Top } from "@/components/app/Top";

export const metadata: Metadata = { title: "Your starters · ferment" };

/** Your shelf: what you've saved from your gatherings or copied from the library. Only you see it. */
export default async function MyStartersPage() {
  const me = await requireUser("/library/mine");
  const mine = await myStarters(db, me.id);
  return (
    <>
      <Top trail={[{ label: "Starters", href: "/library" }, { label: "Yours" }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-3">
          <h1 className="display text-4xl">Your starters</h1>
          <p className="text-[var(--ink-soft)]">Only you see these. Start a gathering from any of them, or copy one to try a variation.</p>
        </div>
        {mine.length === 0 ? (
          <div className="card space-y-3">
            <p>Nothing here yet. There are two ways to make one:</p>
            <ul className="list-disc space-y-1 pl-5 text-[var(--ink-soft)]">
              <li>In a gathering you host, open settings (•••) and choose <em>Save as a starter</em>.</li>
              <li>Open a starter in the library and choose <em>Copy to your starters</em>.</li>
            </ul>
            <Link href="/library" className="link">Look through the library</Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {mine.map((s) => <li key={s.id}><StarterCard s={s} showVisibility /></li>)}
          </ul>
        )}
      </main>
    </>
  );
}
