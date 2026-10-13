import Link from "next/link";
import { db } from "@/db";
import { unreadCount } from "@/domain/notifications";
import { currentSession } from "@/lib/auth";
import { RisingMark } from "./Logo";

export type Crumb = { label: string; href?: string };

/**
 * The bar at the top of every app screen: ferment / community / circle / here.
 * Signed in, ••• opens your settings, or `menu` when a screen has its own.
 */
export async function Top({ trail = [], links = [], menu }: { trail?: Crumb[]; links?: { label: string; href: string }[]; menu?: string }) {
  const session = await currentSession();
  const unread = session ? await unreadCount(db, session.user.id) : 0;
  return (
    <header className="mx-auto flex max-w-2xl items-center gap-3 px-4 pt-5 pb-2">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-2">
          <li className="shrink-0">
            <Link href="/home" className="flex items-center gap-2 text-lg font-medium tracking-tight">
              <RisingMark size={30} />
              ferment
            </Link>
          </li>
          {trail.map((c, i) => (
            <li key={i} className="flex min-w-0 items-center gap-2">
              <span className="text-[var(--ink-faint)]" aria-hidden>/</span>
              {c.href ? (
                <Link href={c.href} className="truncate text-[var(--ink-soft)] hover:text-[var(--ink)]">{c.label}</Link>
              ) : (
                <span className="truncate text-[var(--ink-faint)]" aria-current="page">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <nav className="flex shrink-0 items-center gap-4 text-sm">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="link">{l.label}</Link>
        ))}
        {session && (
          <Link href="/inbox" className="inbox-link" aria-label={unread ? `Inbox, ${unread} new` : "Inbox"}>
            Inbox
            {unread > 0 && <span className="inbox-count">{unread > 99 ? "99+" : unread}</span>}
          </Link>
        )}
        {session && (
          <Link href={menu ?? "/settings"} className="text-lg leading-none tracking-widest text-[var(--ink-soft)] hover:text-[var(--ink)]" aria-label="Settings">
            •••
          </Link>
        )}
      </nav>
    </header>
  );
}
