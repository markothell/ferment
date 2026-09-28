import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { communityHome } from "@/domain/communities";
import { loadCommunity } from "@/lib/community";
import { displayName } from "@/lib/session";
import { CircleCard } from "@/components/app/CircleCard";
import { Top } from "@/components/app/Top";

export async function generateMetadata({ params }: PageProps<"/c/[community]">): Promise<Metadata> {
  const { community } = await loadCommunity((await params).community);
  return { title: `${community.name} · ferment` };
}

export default async function CommunityPage({ params }: PageProps<"/c/[community]">) {
  const { me, community, isHost } = await loadCommunity((await params).community);
  const home = await communityHome(db, community, me.id);
  const base = `/c/${community.slug}`;
  const setupLeft = isHost && (!home.welcome || home.circles.length === 0 || home.members.length < 2);

  return (
    <>
      <Top here={{ label: community.name, href: base }} links={[{ label: "Invite", href: `${base}/invite` }]} />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <header className="space-y-3">
          <h1 className="display text-4xl">{community.name}</h1>
          {community.welcomeNote && (
            <p className="whitespace-pre-line text-[var(--ink-soft)]">{community.welcomeNote}</p>
          )}
        </header>

        {setupLeft && (
          <Link href={`${base}/setup`} className="card block">
            <span className="label">for the host</span>
            <span className="mt-1 block font-medium">Finish setting up →</span>
          </Link>
        )}

        {home.welcome && (
          <section className="card space-y-2">
            <span className="label flex items-center gap-2">
              <span className="dot-live" aria-hidden /> <span className="live">open question</span>
            </span>
            <p className="display text-2xl leading-snug">{home.welcome.question}</p>
            <p className="text-sm text-[var(--ink-faint)]">Answering opens with rounds, coming next.</p>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-2xl">Circles</h2>
            <Link href={`${base}/circles/new`} className="link text-sm">Propose a circle</Link>
          </div>
          {home.circles.length === 0 ? (
            <p className="text-[var(--ink-soft)]">No circles yet.</p>
          ) : (
            <ul className="space-y-3">
              {home.circles.map((c) => (
                <CircleCard key={c.id} circle={c} community={community.slug} />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="display text-2xl">
            People <span className="mono text-base text-[var(--ink-faint)]">{home.members.length}</span>
          </h2>
          <ul className="flex flex-wrap gap-2">
            {home.members.map((m) => (
              <li key={m.userId} className="rounded-full border border-[var(--rule)] px-3 py-1 text-sm">
                {displayName(m)}
                {m.role === "host" && <span className="label ml-2">host</span>}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
