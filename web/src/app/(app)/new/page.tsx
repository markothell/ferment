import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { mayView, questionCount, starterBySlug } from "@/domain/starters";
import { requireUser } from "@/lib/session";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { CircleGlyph, GatheringGlyph } from "@/components/app/Glyph";
import { Top } from "@/components/app/Top";
import { startCircle, startGathering } from "./actions";

export const metadata: Metadata = { title: "Start · ferment" };

// Two doors (GROUPS.md §6): a circle on its own, first, and a gathering. With
// ?starter=, the gathering opens with that starter's design, since a starter
// is a gathering's design. ?kind=gathering opens the second door first.
export default async function NewPage({ searchParams }: PageProps<"/new">) {
  const sp = await searchParams;
  const slug = sp.starter;
  const me = await requireUser(typeof slug === "string" ? `/new?starter=${encodeURIComponent(slug)}` : "/new");
  const found = typeof slug === "string" ? await starterBySlug(db, slug) : null;
  const starter = found && mayView(found, { id: me.id, email: me.email }) ? found : null;
  const gatheringFirst = Boolean(starter) || sp.kind === "gathering";

  const circleDoor = (
    <section className="space-y-4" id="circle">
      <div className="space-y-2">
        <h2 className="display flex items-center gap-3 text-3xl"><CircleGlyph size={34} /> Start a circle</h2>
        <p className="text-[var(--ink-soft)]">
          Four to twelve people you know, around one question at a time. Everyone answers once, in their own voice, and then the circle sees where it landed.
          Name it, ask the first question, then invite a few people. It can grow into a gathering later.
        </p>
      </div>
      <Form action={startCircle} submit="Start the circle" pending="Starting…">
        <Field label="Name" name="name" required maxLength={60} placeholder="Tuesday evenings" />
        <Field label="What it's for" name="description" maxLength={500} placeholder="Optional" />
        <Field label="Its first question" name="question" maxLength={200} placeholder="What fed you this week?" hint="It opens when the fourth person is in." />
      </Form>
    </section>
  );

  const gatheringDoor = (
    <section className="space-y-4" id="gathering">
      <div className="space-y-2">
        <h2 className="display flex items-center gap-3 text-3xl"><GatheringGlyph size={34} /> Host a gathering</h2>
        <p className="text-[var(--ink-soft)]">
          Several circles and the people not yet in one, thinking something through together, with a question to everyone at the centre.
          {starter ? " It opens with the starter's design, and nobody is invited until you say so." : " Next you'll ask everyone a first question and set up a few circles, then invite people."}
        </p>
      </div>

      {starter && (
        <div className="card space-y-1">
          <p className="label">starting from</p>
          <p className="display text-2xl">{starter.title}</p>
          <p className="text-sm text-[var(--ink-soft)]">
            {starter.content.circles.length} {starter.content.circles.length === 1 ? "circle" : "circles"} · {questionCount(starter.content)} questions ·{" "}
            <Link href={`/library/${starter.slug}`} className="link">look again</Link> · <Link href="/new?kind=gathering" className="link">start from nothing instead</Link>
          </p>
        </div>
      )}

      <div className="space-y-4">
        <Form action={startGathering} submit={starter ? "Start it" : "Create the gathering"} pending="Starting…">
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
        {!starter && (
          <p className="text-sm text-[var(--ink-soft)]">
            Or begin from a starter: circles and questions made by people who&apos;ve run them, which you can change before anyone is invited.{" "}
            <Link href="/library" className="link">See the starters</Link>
          </p>
        )}
      </div>
    </section>
  );

  return (
    <>
      <Top trail={[{ label: "Start" }]} />
      <main className="mx-auto max-w-2xl space-y-12 px-4 py-8">
        <div className="space-y-2">
          <h1 className="display text-4xl">Where to start</h1>
          <p className="text-[var(--ink-soft)]">
            A circle for a few people around one thing, or a gathering for several circles. A circle can grow into a gathering when it&apos;s time.
          </p>
          <p className="text-sm text-[var(--ink-soft)]">
            <a href="#circle" className="link">Start a circle</a> · <a href="#gathering" className="link">Host a gathering</a>
          </p>
        </div>
        {gatheringFirst ? (
          <>
            {gatheringDoor}
            <div className="border-t border-[var(--rule)] pt-10">{circleDoor}</div>
          </>
        ) : (
          <>
            {circleDoor}
            <div className="border-t border-[var(--rule)] pt-10">{gatheringDoor}</div>
          </>
        )}
      </main>
    </>
  );
}
