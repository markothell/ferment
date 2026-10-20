import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { library, mayView, questionCount, starterBySlug } from "@/domain/starters";
import { requireUser } from "@/lib/session";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { StarterCard } from "@/components/app/StarterCard";
import { Top } from "@/components/app/Top";
import { startGathering } from "./actions";

export const metadata: Metadata = { title: "Start a gathering · ferment" };

// "Start a conversation" lands here (STARTERS.md §5). With ?starter=, the
// gathering opens with that starter's design; without, it starts empty, and
// a few starters are offered first.
export default async function NewGatheringPage({ searchParams }: PageProps<"/new">) {
  const slug = (await searchParams).starter;
  const me = await requireUser(typeof slug === "string" ? `/new?starter=${encodeURIComponent(slug)}` : "/new");
  const found = typeof slug === "string" ? await starterBySlug(db, slug) : null;
  const starter = found && mayView(found, { id: me.id, email: me.email }) ? found : null;
  const offered = starter ? [] : (await library(db)).slice(0, 3);

  return (
    <>
      <Top trail={[{ label: "Start a gathering" }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="display text-4xl">Start a gathering</h1>
          <p className="text-[var(--ink-soft)]">
            A place for a few dozen people to think something through together, in small circles. You&apos;ll host it.
            {starter ? " It opens with the starter's design, and nobody is invited until you say so." : " Next you'll set a welcome question and a few circles, then invite people."}
          </p>
        </div>

        {starter && (
          <div className="card space-y-1">
            <p className="label">starting from</p>
            <p className="display text-2xl">{starter.title}</p>
            <p className="text-sm text-[var(--ink-soft)]">
              {starter.content.circles.length} {starter.content.circles.length === 1 ? "circle" : "circles"} · {questionCount(starter.content)} questions ·{" "}
              <Link href={`/library/${starter.slug}`} className="link">look again</Link> · <Link href="/new" className="link">start from nothing instead</Link>
            </p>
          </div>
        )}

        {offered.length > 0 && (
          <section className="space-y-3">
            <h2 className="display text-2xl">From a starter</h2>
            <p className="text-[var(--ink-soft)]">Circles and questions ready to go, made by people who&apos;ve run them. Open one to see it whole.</p>
            <ul className="space-y-3">
              {offered.map((s) => <li key={s.id}><StarterCard s={s} /></li>)}
            </ul>
            <Link href="/library" className="link">All starters</Link>
          </section>
        )}

        <section className="space-y-4">
          {offered.length > 0 && <h2 className="display text-2xl">From nothing</h2>}
          <Form action={startGathering} submit={starter ? "Start it" : "Create"} pending="Starting…">
            {starter && <input type="hidden" name="starter" value={starter.id} />}
            <Field label="Name" name="name" required maxLength={60} placeholder="Tuesday Tables" defaultValue={starter?.title.slice(0, 60)}
              hint={starter ? "Yours, not the starter's. Who's gathering, or what about." : undefined} />
            <Field
              label="Welcome note"
              name="note"
              multiline
              maxLength={2000}
              defaultValue={starter?.content.welcomeNote}
              hint="What this gathering is and why it's here. The first thing an invitee reads. You can change it later."
            />
          </Form>
        </section>
      </main>
    </>
  );
}
