import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { db } from "@/db";
import { listMyCommunities } from "@/domain/communities";
import { requireUser } from "@/lib/session";
import { THEME_COOKIE, savedTheme } from "@/lib/theme";
import { ThemeSwitch } from "@/components/app/ThemeSwitch";
import { Top } from "@/components/app/Top";

export const metadata: Metadata = { title: "Settings · ferment" };

// Your account's settings, behind the ••• on every screen. Each community's own
// (its email, and hosting) stay on its page, linked from here, and so does /contact.
export default async function AccountSettingsPage() {
  const me = await requireUser("/settings");
  const mine = await listMyCommunities(db, me.id);
  const theme = savedTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <>
      <Top trail={[{ label: "Settings" }]} />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <h1 className="display text-4xl">Settings</h1>

        <section className="space-y-3">
          <h2 className="display text-2xl">Appearance</h2>
          <ThemeSwitch initial={theme} />
        </section>

        {mine.length > 0 && (
          <section className="space-y-3 border-t border-[var(--rule)] pt-8">
            <h2 className="display text-2xl">Your communities</h2>
            <p className="text-sm text-[var(--ink-soft)]">Email, and hosting if it&rsquo;s yours, are set for each one.</p>
            <ul className="space-y-3">
              {mine.map((c) => (
                <li key={c.id}>
                  <Link href={`/c/${c.slug}/settings`} className="card flex items-center justify-between">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-[var(--ink-soft)]" aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3 border-t border-[var(--rule)] pt-8">
          <h2 className="display text-2xl">Get in touch</h2>
          <Link href="/contact" className="card flex items-center justify-between">
            <span>
              <span className="block font-medium">Write to us</span>
              <span className="block text-sm text-[var(--ink-soft)]">A question, an idea, or something that broke.</span>
            </span>
            <span className="text-[var(--ink-soft)]" aria-hidden>→</span>
          </Link>
        </section>
      </main>
    </>
  );
}
