import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { gatheringHome } from "@/domain/gatherings";
import { loadGathering } from "@/lib/gathering";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { Top } from "@/components/app/Top";
import { invite, proposeCircle, saveWelcomeNote, saveWelcomeQuestion } from "../actions";

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

export default async function SetupPage({ params }: PageProps<"/g/[gathering]/setup">) {
  const { me, gathering, isHost } = await loadGathering((await params).gathering);
  if (!isHost) notFound();
  const home = await gatheringHome(db, gathering, me.id);
  const base = `/g/${gathering.slug}`;
  const hidden = <input type="hidden" name="gathering" value={gathering.slug} />;

  return (
    <>
      <Top trail={[{ label: gathering.name, href: base }, { label: "Set up" }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="display text-4xl">Set up {gathering.name}</h1>
          <p className="text-[var(--ink-soft)]">
            Newcomers read your note, answer the welcome question, then pick a circle. Aim for someone sharing within five minutes of arriving.
          </p>
        </div>

        <Step n={1} title="A welcome note" done={Boolean(gathering.welcomeNote)}>
          <Form action={saveWelcomeNote} submit="Save note" quiet>
            {hidden}
            <Field label="What this group is, and why it's here" name="note" multiline maxLength={2000} defaultValue={gathering.welcomeNote} />
          </Form>
        </Step>

        <Step n={2} title="A welcome question" done={Boolean(home.welcome)}>
          <p className="text-[var(--ink-soft)]">
            Every newcomer is invited to answer it, by voice or in writing, and everyone can hear the answers. It&apos;s how people first meet.
          </p>
          <Form action={saveWelcomeQuestion} submit="Save question" quiet>
            {hidden}
            <Field
              label="The question"
              name="question"
              maxLength={200}
              required
              defaultValue={home.welcome?.question ?? ""}
              placeholder="What's something you're learning right now?"
            />
          </Form>
        </Step>

        <Step n={3} title="Circles to join" done={home.circles.length > 0}>
          <p className="text-[var(--ink-soft)]">
            Two or three starter circles, each with a first question ready. You hold the host seat; each begins when four people are in.
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

        <div className="border-t border-[var(--rule)] pt-8">
          <Link href={base} className="button">Go to {gathering.name}</Link>
        </div>
      </main>
    </>
  );
}
