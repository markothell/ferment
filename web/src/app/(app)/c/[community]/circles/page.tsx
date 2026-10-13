import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { communityHome } from "@/domain/communities";
import { loadCommunity } from "@/lib/community";
import { CircleCard } from "@/components/app/CircleCard";
import { CommunityHeader } from "@/components/app/CommunityHeader";
import { Top } from "@/components/app/Top";

export const metadata: Metadata = { title: "Circles · ferment" };

export default async function CirclesPage({ params }: PageProps<"/c/[community]/circles">) {
  const { me, community } = await loadCommunity((await params).community);
  const home = await communityHome(db, community, me.id);
  const base = `/c/${community.slug}`;
  return (
    <>
      <Top trail={[{ label: community.name, href: base }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <CommunityHeader name={community.name} slug={community.slug} tab="circles" />
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-2xl">
              Circles <span className="mono text-base text-[var(--ink-faint)]">{home.circles.length}</span>
            </h2>
            <Link href={`${base}/circles/new`} className="link text-sm">Propose a circle</Link>
          </div>
          {home.circles.length === 0 ? (
            <p className="text-[var(--ink-soft)]">No circles yet.</p>
          ) : (
            <ul className="space-y-3">
              {home.circles.map((c) => <CircleCard key={c.id} circle={c} community={community.slug} />)}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
