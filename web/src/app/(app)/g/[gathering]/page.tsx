import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { gatheringHome, gatheringMapData } from "@/domain/gatherings";
import { invitesWaiting } from "@/domain/invites";
import { gatheringQuestions } from "@/domain/rounds";
import { loadGathering } from "@/lib/gathering";
import { displayName } from "@/lib/session";
import { GatheringMap } from "@/components/app/GatheringMap";
import { RoundRow } from "@/components/app/RoundRow";
import { TurnDot } from "@/components/app/TurnDot";
import { GatheringHeader } from "@/components/app/GatheringHeader";
import { Top } from "@/components/app/Top";

export async function generateMetadata({ params }: PageProps<"/g/[gathering]">): Promise<Metadata> {
  const { gathering } = await loadGathering((await params).gathering);
  return { title: `${gathering.name} · ferment` };
}

export default async function GatheringPage({ params }: PageProps<"/g/[gathering]">) {
  const { me, gathering, isHost } = await loadGathering((await params).gathering);
  const [home, questions, map, suggestions] = await Promise.all([
    gatheringHome(db, gathering, me.id),
    gatheringQuestions(db, gathering.id, me.id),
    gatheringMapData(db, gathering.id),
    isHost ? invitesWaiting(db, gathering.id, me.id) : [],
  ]);
  const welcome = questions.find((q) => q.welcome);
  const others = questions.filter((q) => !q.welcome);
  const mayAsk = gathering.membersPostOpenQuestions || isHost;
  const base = `/g/${gathering.slug}`;
  const setupLeft = isHost && (!home.welcome || home.circles.length === 0 || home.members.length < 2);

  return (
    <>
      <Top trail={[{ label: gathering.name }]} />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <GatheringHeader name={gathering.name} slug={gathering.slug} tab="home">
          {gathering.welcomeNote && (
            <p className="whitespace-pre-line text-[var(--ink-soft)]">{gathering.welcomeNote}</p>
          )}
        </GatheringHeader>

        <GatheringMap
          people={home.members.map((m) => ({ id: m.userId, name: displayName(m) }))}
          circles={map.circles}
          openQuestions={map.openQuestions}
          answerers={map.answerers}
          viewerId={me.id}
          base={base}
          label={`${gathering.name}: ${home.members.length} people, ${map.circles.length} circles, ${map.openQuestions} open questions.`}
        />

        {setupLeft && (
          <Link href={`${base}/setup`} className="card block">
            <span className="label">for the host</span>
            <span className="mt-1 block font-medium">Finish setting up →</span>
          </Link>
        )}

        {suggestions.length > 0 && (
          <Link href={`${base}/people#waiting`} className="card block border-l-2 border-l-[var(--shared)]">
            <span className="label">for the host</span>
            <span className="mt-1 block font-medium">
              {suggestions.length === 1 ? `${suggestions[0].by} suggests inviting ${suggestions[0].name}` : `${suggestions.length} people suggested`} →
            </span>
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

        <section id="questions" className="scroll-mt-4 space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-2xl">Open questions</h2>
            {mayAsk && <Link href={`${base}/ask`} className="link text-sm">Ask the gathering</Link>}
          </div>
          {others.length === 0 ? (
            <p className="text-[var(--ink-soft)]">None yet.</p>
          ) : (
            <ul className="space-y-3">
              {others.map((q) => <RoundRow key={q.id} round={q} href={`${base}/r/${q.id}`} />)}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
