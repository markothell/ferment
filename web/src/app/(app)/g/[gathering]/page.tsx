import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { gatheringHome, gatheringMapData } from "@/domain/gatherings";
import { invitesWaiting } from "@/domain/invites";
import { gatheringQuestions, roundView } from "@/domain/rounds";
import { CircleView } from "./circles/[circle]/CircleView";
import { loadGathering } from "@/lib/gathering";
import { displayName } from "@/lib/session";
import { GatheringMap } from "@/components/app/GatheringMap";
import { PlacementResult } from "@/components/app/PlacementResult";
import { RoundRow } from "@/components/app/RoundRow";
import { TurnDot } from "@/components/app/TurnDot";
import { WordsPortrait } from "@/components/app/WordsPortrait";
import { GatheringHeader } from "@/components/app/GatheringHeader";
import { Top } from "@/components/app/Top";

export async function generateMetadata({ params }: PageProps<"/g/[gathering]">): Promise<Metadata> {
  const { gathering } = await loadGathering((await params).gathering);
  return { title: `${gathering.name} · ferment` };
}

export default async function GatheringPage({ params }: PageProps<"/g/[gathering]">) {
  const { me, gathering, isHost } = await loadGathering((await params).gathering);
  // A circle on its own is its own root: its page is the circle's.
  if (gathering.kind === "circle") return <CircleView me={me} gathering={gathering} circle={gathering} />;
  const [home, questions, map, suggestions] = await Promise.all([
    gatheringHome(db, gathering, me.id),
    gatheringQuestions(db, gathering.id, me.id),
    gatheringMapData(db, gathering.id),
    isHost ? invitesWaiting(db, gathering.id, me.id) : [],
  ]);
  // The question at the centre, with what the gathering has made of it so far.
  const centre = home.pinned ? questions.find((q) => q.id === home.pinned!.roundId) ?? null : null;
  const centreView = centre ? await roundView(db, centre.id, me.id) : null;
  const others = questions.filter((q) => q.id !== centre?.id);
  const mayAsk = gathering.membersPostOpenQuestions || isHost;
  const base = `/g/${gathering.slug}`;
  const setupLeft = isHost && (!home.pinned || home.circles.length === 0 || home.members.length < 2);

  return (
    <>
      <Top trail={[{ label: gathering.name }]} />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <GatheringHeader name={gathering.name} slug={gathering.slug} tab="home">
          {gathering.note && (
            <p className="whitespace-pre-line text-[var(--ink-soft)]">{gathering.note}</p>
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

        {centre && centreView && (
          <section className="card space-y-3">
            <span className={centre.phase === "open" ? "label live flex items-center gap-2" : "label"}>
              <TurnDot open={centre.phase === "open"} answered={centre.respondedByMe} /> {home.pinned?.pinned ? "pinned to the centre" : "at the centre"}
            </span>
            <Link href={`${base}/r/${centre.id}`} className="display block text-2xl leading-snug">{centre.question}</Link>
            {centreView.aggregate && centreView.prompt.shape === "words" && centreView.aggregate.words.length > 0 && (
              <WordsPortrait words={centreView.aggregate.words.slice(0, 24)} />
            )}
            {centreView.aggregate && (centreView.prompt.shape === "placement" || centreView.prompt.shape === "story_placement") && (
              <PlacementResult
                axes={centreView.prompt.axes}
                dots={centreView.responses.map((r) => ({ id: r.id, name: displayName(r), x: r.x, y: r.y, mine: r.userId === me.id }))}
                x={centreView.aggregate.x}
                y={centreView.aggregate.y}
              />
            )}
            <p className="mono text-sm text-[var(--ink-soft)]">{centre.responded} shared</p>
            {!centre.respondedByMe && centre.phase === "open" && <Link href={`${base}/r/${centre.id}`} className="button">Answer it</Link>}
          </section>
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
