import type { Metadata } from "next";
import { GatheringMap } from "@/components/app/GatheringMap";
import { Top } from "@/components/app/Top";
import { NAMES, demoCircles, personId as id } from "./fixtures";

export const metadata: Metadata = { title: "A gathering · ferment" };

// Hillside Tables (./fixtures.ts). Read-only; no sign-in.
const CIRCLES = demoCircles().map((c) => ({
  id: c.id, slug: c.slug, name: c.name, color: c.color, forming: c.forming,
  members: c.members.map(id),
  explored: c.rounds.filter((r) => !r.open).length,
  open: c.rounds.filter((r) => r.open).length,
}));

// ?n=6 trims the fixture to its first n people, to see a young gathering.
export default async function DemoGathering({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const n = Math.min(NAMES.length, Math.max(1, Number((await searchParams).n) || NAMES.length));
  const names = NAMES.slice(0, n);
  const circles = CIRCLES.map((c) => ({ ...c, members: c.members.filter((m) => Number(m.slice(1)) < n) })).filter((c) => c.members.length > 0);
  return (
    <>
      <Top trail={[{ label: "Hillside Tables, an example" }]} />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <GatheringMap
          people={names.map((name, i) => ({ id: id(i), name }))}
          circles={circles}
          openQuestions={2}
          answerers={names.map((_, i) => id(i)).filter((_, i) => (i * 7) % 3 !== 0).slice(0, 26)}
          viewerId={id(6)}
          base="/demo/gathering"
          circleBase="/demo/gathering/circles"
          label={`${n} people on an outer ring, gathered into ${circles.length} circles, with two open questions at the center.`}
        />
        <p className="text-center text-sm text-[var(--ink-soft)]">Hover or tap a circle, a person, or the center.</p>
      </main>
    </>
  );
}
