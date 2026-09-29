import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { communityHome } from "@/domain/communities";
import { communityQuestions } from "@/domain/rounds";
import { loadCommunity } from "@/lib/community";
import { displayName } from "@/lib/session";
import { CircleCard } from "@/components/app/CircleCard";
import { RoundRow } from "@/components/app/RoundRow";
import { TurnDot } from "@/components/app/TurnDot";
import { Top } from "@/components/app/Top";

export async function generateMetadata({ params }: PageProps<"/c/[community]">): Promise<Metadata> {
  const { community } = await loadCommunity((await params).community);
  return { title: `${community.name} · ferment` };
}

export default async function CommunityPage({ params }: PageProps<"/c/[community]">) {
  const { me, community, isHost } = await loadCommunity((await params).community);
  const [home, questions] = await Promise.all([communityHome(db, community, me.id), communityQuestions(db, community.id, me.id)]);
  const welcome = questions.find((q) => q.welcome);
  const others = questions.filter((q) => !q.welcome);
  const mayAsk = community.membersPostOpenQuestions || isHost;
  const base = `/c/${community.slug}`;
  const setupLeft = isHost && (!home.welcome || home.circles.length === 0 || home.members.length < 2);

  return (
    <>
      <Top trail={[{ label: community.name }]} links={[{ label: "Invite", href: `${base}/invite` }]} />
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

        {welcome && (
          <Link href={`${base}/r/${welcome.id}`} className="card block space-y-2">
            <span className="label live flex items-center gap-2">
              <TurnDot open answered={welcome.respondedByMe} /> welcome question
            </span>
            <p className="display text-2xl leading-snug">{welcome.question}</p>
            <p className="mono text-sm text-[var(--ink-soft)]">
              {welcome.responded} shared
            </p>
            {!welcome.respondedByMe && <span className="button mt-2">Answer it</span>}
          </Link>
        )}

        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-2xl">Open questions</h2>
            {mayAsk && <Link href={`${base}/ask`} className="link text-sm">Ask the community</Link>}
          </div>
          {others.length === 0 ? (
            <p className="text-[var(--ink-soft)]">None yet.</p>
          ) : (
            <ul className="space-y-3">
              {others.map((q) => <RoundRow key={q.id} round={q} href={`${base}/r/${q.id}`} />)}
            </ul>
          )}
        </section>

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
