import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { gatheringHome } from "@/domain/gatherings";
import { invitesWaiting } from "@/domain/invites";
import { loadGroup } from "@/lib/group";
import { displayName } from "@/lib/session";
import { GatheringHeader } from "@/components/app/GatheringHeader";
import { SuggestionsWaiting } from "@/components/app/SuggestionsWaiting";
import { Top } from "@/components/app/Top";

export const metadata: Metadata = { title: "People · ferment" };

export default async function PeoplePage({ params }: PageProps<"/g/[group]/people">) {
  const { me, gathering, isHost } = await loadGroup((await params).group);
  const [home, suggestions] = await Promise.all([
    gatheringHome(db, gathering, me.id),
    isHost ? invitesWaiting(db, gathering.id, me.id) : [],
  ]);
  const base = `/g/${gathering.slug}`;
  return (
    <>
      <Top trail={[{ label: gathering.name, href: base }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <GatheringHeader name={gathering.name} slug={gathering.slug} tab="people" />
        <SuggestionsWaiting suggestions={suggestions} gathering={gathering.slug} members={home.members.length} maxMembers={gathering.maxMembers} />
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-2xl">
              People <span className="mono text-base text-[var(--ink-faint)]">{home.members.length}</span>
            </h2>
            <Link href={`${base}/invite`} className="link text-sm">{isHost ? "Invite someone" : "Suggest someone"}</Link>
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
