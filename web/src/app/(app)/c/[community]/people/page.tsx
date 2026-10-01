import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { communityHome } from "@/domain/communities";
import { loadCommunity } from "@/lib/community";
import { displayName } from "@/lib/session";
import { CommunityHeader } from "@/components/app/CommunityHeader";
import { Top } from "@/components/app/Top";

export const metadata: Metadata = { title: "People · ferment" };

export default async function PeoplePage({ params }: PageProps<"/c/[community]/people">) {
  const { me, community } = await loadCommunity((await params).community);
  const home = await communityHome(db, community, me.id);
  const base = `/c/${community.slug}`;
  return (
    <>
      <Top trail={[{ label: community.name, href: base }]} menu={`${base}/settings`} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <CommunityHeader name={community.name} slug={community.slug} tab="people" />
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-2xl">
              People <span className="mono text-base text-[var(--ink-faint)]">{home.members.length}</span>
            </h2>
            <Link href={`${base}/invite`} className="link text-sm">Invite someone</Link>
          </div>
          <ul className="divide-y divide-[var(--rule)]">
            {home.members.map((m) => (
              <li key={m.userId} className="flex items-baseline justify-between gap-3 py-3">
                <span>
                  {displayName(m)}
                  {m.userId === me.id && <span className="text-[var(--ink-faint)]"> (you)</span>}
                </span>
                {m.role === "host" && <span className="label">host</span>}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
