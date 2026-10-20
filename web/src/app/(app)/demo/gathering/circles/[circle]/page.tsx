import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleMap } from "@/components/app/CircleMap";
import { CircleGlyph } from "@/components/app/Glyph";
import { Top } from "@/components/app/Top";
import { CIRCLE_MIN } from "@/domain/circles";
import { relative } from "@/lib/time";
import { NAMES, demoCircle, mapRounds, personId } from "../../fixtures";

// A circle in Hillside Tables (../../fixtures.ts): its seats, the rounds it
// has shared, and the one open now. Read-only; no sign-in.

type Props = { params: Promise<{ circle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = demoCircle((await params).circle);
  return { title: c ? `${c.name}, an example · ferment` : "ferment" };
}

export default async function DemoCircle({ params }: Props) {
  const c = demoCircle((await params).circle);
  if (!c) notFound();
  const base = `/demo/gathering/circles/${c.slug}`;
  const newestFirst = [...c.rounds].reverse();
  const need = Math.max(0, CIRCLE_MIN - c.members.length);

  return (
    <>
      <Top trail={[{ label: "Hillside Tables, an example", href: "/demo/gathering" }, { label: c.name }]} />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <header className={`${c.color ? `tint-${c.color} ` : ""}space-y-3 rounded-2xl bg-[color-mix(in_srgb,var(--tint-soft)_40%,transparent)] p-5`}>
          <div className="flex items-center gap-4">
            <CircleGlyph size={44} forming={c.forming} color={c.color} />
            <div className="min-w-0">
              <span className="label">{c.forming ? "forming" : "circle"}</span>
              <h1 className="display truncate text-4xl leading-tight">{c.name}</h1>
            </div>
          </div>
          {c.forming && <p className="text-[var(--ink-soft)]">Needs {need} more to begin.</p>}
        </header>

        <section className="space-y-3">
          <CircleMap
            seats={c.members.map((i) => ({ id: personId(i), name: NAMES[i] }))}
            rounds={mapRounds(c)}
            emptySeats={c.forming ? need : 0}
            roundBase={base}
            label={`${c.name}: ${c.members.length} people. Rounds they've shared spiral in to what's open now.`}
          />
          <p className="mono text-center text-sm text-[var(--ink-soft)]">{c.members.map((i) => NAMES[i]).join(" · ")}</p>
        </section>

        {newestFirst.length > 0 ? (
          <section className="space-y-4">
            <h2 className="display text-2xl">What they&apos;ve asked each other</h2>
            <ul className="space-y-3">
              {newestFirst.map((r) => (
                <li key={r.id}>
                  <Link href={`${base}/${r.id}`} className="card block space-y-1 hover:border-[var(--ink-faint)]">
                    <span className={r.open ? "label live" : "label"}>
                      {r.open && r.closesAt ? `open · closes ${relative(r.closesAt)}` : relative(r.at)}
                    </span>
                    <p className="text-lg">{r.question}</p>
                    <p className="text-sm text-[var(--ink-soft)]">
                      {r.answers.length} {r.answers.length === 1 ? "answer" : "answers"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="text-center text-[var(--ink-soft)]">
            Once {need} more people join, {c.name} asks its first question.
          </p>
        )}
      </main>
    </>
  );
}
