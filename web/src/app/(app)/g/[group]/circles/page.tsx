import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { gatheringHome } from "@/domain/gatherings";
import { loadGroup } from "@/lib/group";
import { CircleCard } from "@/components/app/CircleCard";
import { GatheringHeader } from "@/components/app/GatheringHeader";
import { Top } from "@/components/app/Top";

export const metadata: Metadata = { title: "Circles · ferment" };

export default async function CirclesPage({ params }: PageProps<"/g/[group]/circles">) {
  const { me, gathering } = await loadGroup((await params).group);
  const home = await gatheringHome(db, gathering, me.id);
  const base = `/g/${gathering.slug}`;
  return (
    <>
      <Top trail={[{ label: gathering.name, href: base }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <GatheringHeader name={gathering.name} slug={gathering.slug} tab="circles" />
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
              {home.circles.map((c) => <CircleCard key={c.id} circle={c} gathering={gathering.slug} />)}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
