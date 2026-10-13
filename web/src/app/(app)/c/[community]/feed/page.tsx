import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { feed } from "@/domain/feed";
import { loadCommunity } from "@/lib/community";
import { CommunityHeader } from "@/components/app/CommunityHeader";
import { FeedList } from "@/components/app/FeedList";
import { Top } from "@/components/app/Top";

export const metadata: Metadata = { title: "What we're talking about · ferment" };

export default async function FeedPage({ params, searchParams }: PageProps<"/c/[community]/feed">) {
  const { me, community } = await loadCommunity((await params).community);
  const all = await feed(db, community.id, me.id);
  // A filter, not a ranking: harvests never change the order.
  const withHarvests = (await searchParams).with === "harvests";
  const items = withHarvests ? all.filter((i) => i.harvests.length > 0) : all;
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--ground)]" : "border-[var(--rule)] text-[var(--ink-soft)] hover:text-[var(--ink)]"}`;
  return (
    <>
      <Top trail={[{ label: community.name, href: `/c/${community.slug}` }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <CommunityHeader name={community.name} slug={community.slug} tab="feed" />
        <div className="space-y-2">
          <h2 className="display text-2xl">What we&apos;re talking about</h2>
          <p className="text-[var(--ink-soft)]">
            Questions asked in {community.name}, by how many circles took them up. Tap one to see where it&apos;s been, suggest it to your circle, or start a circle around it.
          </p>
        </div>
        <nav aria-label="Filter the feed" className="flex gap-2">
          <Link href={`/c/${community.slug}/feed`} className={chip(!withHarvests)} aria-current={!withHarvests ? "page" : undefined}>All</Link>
          <Link href={`/c/${community.slug}/feed?with=harvests`} className={chip(withHarvests)} aria-current={withHarvests ? "page" : undefined}>With harvests</Link>
        </nav>
        {items.length === 0 ? (
          <p className="text-[var(--ink-soft)]">
            {withHarvests ? "No harvests yet. When a circle opens a round to the community, its question shows here." : "Nothing yet. Questions appear here once a circle opens them."}
          </p>
        ) : (
          <FeedList items={items} community={community.slug} />
        )}
      </main>
    </>
  );
}
