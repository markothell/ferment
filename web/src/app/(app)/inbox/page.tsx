import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { listNotifications, markAllRead } from "@/domain/notifications";
import { requireUser } from "@/lib/session";
import { relative } from "@/lib/time";
import { Top } from "@/components/app/Top";

export const metadata: Metadata = { title: "Inbox · ferment" };

export default async function InboxPage() {
  const me = await requireUser("/inbox");
  const items = await listNotifications(db, { userId: me.id, limit: 100 });
  // Seen once shown. New ones keep their mark on this visit.
  await markAllRead(db, me.id);
  const gatherings = new Set(items.map((n) => n.gatheringId)).size;

  return (
    <>
      <Top trail={[{ label: "Inbox" }]} />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <h1 className="display text-4xl">Inbox</h1>
        {items.length === 0 ? (
          <p className="text-[var(--ink-soft)]">Nothing yet. When a round opens in your circle, or someone answers your question, it shows up here.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((n) => (
              <li key={n.id}>
                <Link href={n.href} className="inbox-row">
                  <span className={n.readAt ? "inbox-dot" : "inbox-dot inbox-new"} aria-label={n.readAt ? undefined : "new"} />
                  <span className="grid min-w-0 gap-0.5">
                    <span className={n.readAt ? "text-[var(--ink-soft)]" : ""}>{n.text}</span>
                    <span className="mono text-xs text-[var(--ink-faint)]">
                      {gatherings > 1 ? `${n.gatheringName} · ` : ""}{relative(n.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
