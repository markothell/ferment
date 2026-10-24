import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { readHarvest } from "@/domain/harvests.read";
import { loadGroup } from "@/lib/group";
import { CircleGlyph } from "@/components/app/Glyph";
import { Form } from "@/components/app/Form";
import { PlacementResult } from "@/components/app/PlacementResult";
import { SharedAnswer } from "@/components/app/SharedAnswer";
import { Top } from "@/components/app/Top";
import { WordsPortrait } from "@/components/app/WordsPortrait";
import { withdrawHarvestAction } from "../actions";

type Props = PageProps<"/g/[group]/h/[harvest]">;

async function load(params: Props["params"]) {
  const p = await params;
  const ctx = await loadGroup(p.group);
  const harvest = await readHarvest(db, ctx.gathering.id, p.harvest);
  if (!harvest) notFound();
  return { ...ctx, harvest };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { harvest } = await load(params);
  return { title: `${harvest.question} · ${harvest.circleName} · ferment` };
}

/** A harvest: what a circle chose to share from one round, for anyone in the gathering. */
export default async function HarvestPage({ params }: Props) {
  const { me, gathering, harvest } = await load(params);
  const base = `/g/${gathering.slug}`;
  const places = harvest.shape === "placement" || harvest.shape === "story_placement";
  const counts = new Map<string, number>();
  for (const i of harvest.items) for (const w of i.words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const words = [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const since = harvest.upAt?.toLocaleDateString("en", { day: "numeric", month: "long" });

  return (
    <>
      <Top trail={[{ label: gathering.name, href: base }, { label: harvest.circleName, href: `/g/${harvest.circleSlug}` }, { label: "Harvest" }]} />
      <main className={`tint-${harvest.circleColor} mx-auto max-w-2xl space-y-8 px-4 py-8`}>
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <CircleGlyph size={28} color={harvest.circleColor} />
            <span className="label">harvest · from {harvest.circleName}</span>
          </div>
          <h1 className="display text-4xl leading-tight">{harvest.question}</h1>
          <p className="mono text-sm text-[var(--ink-soft)]">
            {harvest.shared} of {harvest.answered} shared{since && ` · opened ${since}`}
          </p>
        </header>

        {places && (
          <PlacementResult
            axes={harvest.axes}
            dots={harvest.items.map((i) => ({ id: i.userId, name: i.name, x: i.x, y: i.y, mine: i.userId === me.id }))}
            x={null}
            y={null}
          />
        )}
        {harvest.shape === "words" && <WordsPortrait words={words} />}

        <section className="space-y-6">
          {harvest.items.map((i) => (
            <SharedAnswer key={i.userId} id={`answer-${i.userId}`} a={i} axes={harvest.axes}>
              {i.userId === me.id && (
                <details className="pt-1">
                  <summary className="link cursor-pointer text-sm">Take mine out</summary>
                  <Form action={withdrawHarvestAction} submit="Take it out" pending="Taking it out…" quiet className="space-y-2 pt-2">
                    <input type="hidden" name="gathering" value={gathering.slug} />
                    <input type="hidden" name="harvest" value={harvest.id} />
                    <input type="hidden" name="from" value="harvest" />
                    <p className="text-sm text-[var(--ink-soft)]">It leaves the harvest now. Inside {harvest.circleName}, nothing changes.</p>
                  </Form>
                </details>
              )}
            </SharedAnswer>
          ))}
        </section>

        <p className="border-t border-[var(--rule)] pt-6 text-sm text-[var(--ink-soft)]">
          Shared by the people named here, from a round in {harvest.circleName}.{" "}
          {harvest.promptId && <Link className="link" href={`${base}/feed?with=harvests#p-${harvest.promptId}`}>See this question in the feed</Link>}
        </p>
      </main>
    </>
  );
}
