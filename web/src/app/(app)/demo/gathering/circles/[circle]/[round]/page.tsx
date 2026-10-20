import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Top } from "@/components/app/Top";
import { relative } from "@/lib/time";
import { NAMES, demoCircle } from "../../../fixtures";

// One round in a Hillside Tables circle (../../../fixtures.ts) and what people
// said. Older rounds keep their answers to the circle, as a real one would to
// anyone looking in. Read-only; no sign-in.

type Props = { params: Promise<{ circle: string; round: string }> };

async function load(params: Props["params"]) {
  const { circle, round } = await params;
  const c = demoCircle(circle);
  const r = c?.rounds.find((x) => x.id === round);
  return c && r ? { c, r } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load(params);
  return { title: found ? `${found.r.question} · ferment` : "ferment" };
}

export default async function DemoRound({ params }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { c, r } = found;
  const base = `/demo/gathering/circles/${c.slug}`;
  const written = r.answers.filter((a) => a.text);
  const others = r.answers.filter((a) => !a.text).map((a) => NAMES[a.by]);
  const at = c.rounds.indexOf(r);
  const newer = c.rounds[at + 1];
  const older = c.rounds[at - 1];

  return (
    <>
      <Top trail={[{ label: "Hillside Tables, an example", href: "/demo/gathering" }, { label: c.name, href: base }, { label: "a round" }]} />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <header className="space-y-3">
          <span className={r.open ? "label live" : "label"}>
            a round in {c.name} · {r.open && r.closesAt ? `closes ${relative(r.closesAt)}` : `asked ${relative(r.at)}`}
          </span>
          <h1 className="display text-4xl leading-tight">{r.question}</h1>
          <p className="text-[var(--ink-soft)]">
            {r.answers.length} of {c.members.length} {r.open ? "have answered so far" : "answered"}.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="display text-2xl">What people shared</h2>
          {written.length > 0 ? (
            <ul className="space-y-3">
              {written.map((a) => (
                <li key={a.by} className="card space-y-2">
                  <p className="font-medium">{NAMES[a.by]}</p>
                  <p className="whitespace-pre-line">{a.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--ink-soft)]">
              {others.join(", ")} answered. What they said stays in the circle.
            </p>
          )}
          {written.length > 0 && others.length > 0 && (
            <p className="text-sm text-[var(--ink-soft)]">Also answered: {others.join(", ")}.</p>
          )}
        </section>

        <nav className="flex justify-between gap-4 text-sm">
          {older ? <Link href={`${base}/${older.id}`} className="link">← {older.question}</Link> : <span />}
          {newer ? <Link href={`${base}/${newer.id}`} className="link text-right">{newer.question} →</Link> : <span />}
        </nav>
      </main>
    </>
  );
}
