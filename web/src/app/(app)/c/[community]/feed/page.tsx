import type { Metadata } from "next";
import { db } from "@/db";
import { feed } from "@/domain/feed";
import { loadCommunity } from "@/lib/community";
import { CommunityHeader } from "@/components/app/CommunityHeader";
import { FeedList } from "@/components/app/FeedList";
import { Top } from "@/components/app/Top";

export const metadata: Metadata = { title: "What we're talking about · ferment" };

export default async function FeedPage({ params }: PageProps<"/c/[community]/feed">) {
  const { me, community } = await loadCommunity((await params).community);
  const items = await feed(db, community.id, me.id);
  return (
    <>
      <Top trail={[{ label: community.name, href: `/c/${community.slug}` }]} menu={`/c/${community.slug}/settings`} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <CommunityHeader name={community.name} slug={community.slug} tab="feed" />
        <div className="space-y-2">
          <h2 className="display text-2xl">What we&apos;re talking about</h2>
          <p className="text-[var(--ink-soft)]">
            Questions asked in {community.name}, by how many circles took them up. Tap one to see where it&apos;s been, suggest it to your circle, or start a circle around it.
          </p>
        </div>
        {items.length === 0 ? (
          <p className="text-[var(--ink-soft)]">Nothing yet. Questions appear here once a circle opens them.</p>
        ) : (
          <FeedList items={items} community={community.slug} />
        )}
      </main>
    </>
  );
}
