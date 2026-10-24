import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { gatheringHome } from "@/domain/gatherings";
import { gatheringOrigin, starterById, startersToAdd } from "@/domain/starters";
import { loadGathering } from "@/lib/gathering";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { PromptFields } from "@/components/app/PromptFields";
import { Top } from "@/components/app/Top";
import { addToGathering } from "@/app/(app)/library/actions";
import { askAndPin, invite, proposeCircle, saveWelcomeNote } from "../actions";

export const metadata: Metadata = { title: "Set up · ferment" };

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-[var(--rule)] pt-8">
      <h2 className="flex items-baseline gap-3">
        <span className="mono text-sm text-[var(--ink-faint)]">{n}</span>
        <span className="display text-2xl">{title}</span>
        {done && <span className="label ml-auto">done</span>}
      </h2>
      {children}
    </section>
  );
}

export default async function SetupPage({ params, searchParams }: PageProps<"/g/[gathering]/setup">) {
  const { me, gathering, isHost } = await loadGathering((await params).gathering);
  if (!isHost) notFound();
  const viewer = { id: me.id, email: me.email };
  const added = (await searchParams).added;
  const [home, origin, toAdd, justAdded] = await Promise.all([
    gatheringHome(db, gathering, me.id),
    gatheringOrigin(db, gathering.id, viewer),
    startersToAdd(db, me.id),
    typeof added === "string" ? starterById(db, added) : null,
  ]);
  const base = `/g/${gathering.slug}`;
  const hidden = <input type="hidden" name="gathering" value={gathering.slug} />;

  return (
    <>
      <Top trail={[{ label: gathering.name, href: base }, { label: "Set up" }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="display text-4xl">Set up {gathering.name}</h1>
          <p className="text-[var(--ink-soft)]">
            Newcomers read your note, answer the question at the centre, then pick a circle. Aim for someone sharing within five minutes of arriving.
          </p>
        </div>

        {origin && (
          <div className="card space-y-1">
            <p className="label">started from</p>
            <p>
              {origin.slug ? <Link href={`/library/${origin.slug}`} className="link">{origin.title}</Link> : origin.title}
            </p>
            <p className="text-sm text-[var(--ink-soft)]">
              Its note, questions to everyone and circles are filled in below. Read them through, change what you like, then invite people.
            </p>
          </div>
        )}
        {justAdded && (
          <p className="text-[var(--ink-soft)]" role="status">Added <em>{justAdded.title}</em>: its circles are below, and its questions to everyone are open.</p>
        )}

        <Step n={1} title="A welcome note" done={Boolean(gathering.note)}>
          <Form action={saveWelcomeNote} submit="Save note" quiet>
            {hidden}
            <Field label="What this group is, and why it's here" name="note" multiline maxLength={2000} defaultValue={gathering.note} />
          </Form>
        </Step>

        <Step n={2} title="A question at the centre" done={Boolean(home.pinned)}>
          <p className="text-[var(--ink-soft)]">
            A question to everyone, pinned to the centre of the gathering. Every newcomer answers it first, and it stays open while it&apos;s pinned.
            Any shape works: a story, a line to stand on, a cloud of words.
          </p>
          {home.pinned ? (
            <p className="card">
              <span className="label">{home.pinned.pinned ? "pinned" : "at the centre for now"}</span>
              <Link href={`${base}/r/${home.pinned.roundId}`} className="mt-1 block font-medium">{home.pinned.question}</Link>
              <span className="mt-1 block text-sm text-[var(--ink-soft)]">
                To change it, <Link href={`${base}/ask`} className="link">ask everyone another question</Link> and pin that one from its page.
              </span>
            </p>
          ) : (
            <Form action={askAndPin} submit="Ask and pin" pending="Asking…" quiet>
              {hidden}
              <PromptFields defaultReveal="open" />
            </Form>
          )}
        </Step>

        <Step n={3} title="Circles to join" done={home.circles.length > 0}>
          <p className="text-[var(--ink-soft)]">
            Two or three circles to begin with, each with a first question ready. You hold the host seat; each begins when four people are in.
          </p>
          {home.circles.length > 0 && (
            <ul className="space-y-1">
              {home.circles.map((c) => (
                <li key={c.id} className="flex justify-between">
                  <span>{c.name}</span>
                  <span className="mono text-sm text-[var(--ink-faint)]">{c.members} in</span>
                </li>
              ))}
            </ul>
          )}
          <Form action={proposeCircle} submit="Add circle" quiet>
            {hidden}
            <input type="hidden" name="back" value="setup" />
            <Field label="Circle name" name="name" required maxLength={60} placeholder="Tuesday evenings" />
            <Field label="What it's for" name="description" maxLength={500} placeholder="Optional" />
            <Field label="Its first question" name="question" maxLength={200} placeholder="What fed you this week?" />
          </Form>
        </Step>

        <Step n={4} title="Invite people" done={home.members.length > 1}>
          <Form action={invite} submit="Send invitation" quiet>
            {hidden}
            <Field label="Their name" name="name" maxLength={60} autoComplete="off" />
            <Field label="Their email" name="email" type="email" required autoComplete="off" />
            {home.circles.length > 0 && (
              <label className="block space-y-2">
                <span className="block font-medium">Into a circle?</span>
                <select name="circle" className="field">
                  <option value="">Just the gathering</option>
                  {home.circles.filter((c) => c.isMember).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}
            <Field label="A note from you" name="note" multiline maxLength={500} placeholder="Optional" />
          </Form>
        </Step>

        {toAdd.length > 0 && (
          <Step n={5} title="Add a starter" done={false}>
            <p className="text-[var(--ink-soft)]">
              Optional. A starter&apos;s circles and questions to everyone join what&apos;s here. Your note and the question at the centre stay as they are.{" "}
              <Link href="/library" className="link">Look through them first</Link>.
            </p>
            <Form action={addToGathering} submit="Add it" pending="Adding…" quiet>
              <input type="hidden" name="gathering" value={gathering.slug} />
              <select name="starter" className="field" aria-label="Starter">
                {toAdd.map((s) => <option key={s.id} value={s.id}>{s.title}{s.visibility === "private" ? " (yours)" : ""}</option>)}
              </select>
            </Form>
          </Step>
        )}

        <div className="space-y-4 border-t border-[var(--rule)] pt-8">
          <Link href={base} className="button">Go to {gathering.name}</Link>
          <p className="text-center text-sm text-[var(--ink-soft)]">
            Happy with how it&apos;s set up? <Link href={`${base}/starter`} className="link">Save it as a starter</Link> to begin another one like it.
          </p>
        </div>
      </main>
    </>
  );
}
