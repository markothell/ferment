import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { gatheringOrigin, savedFrom } from "@/domain/starters";
import { loadGathering } from "@/lib/gathering";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { Top } from "@/components/app/Top";
import { saveFromGathering } from "@/app/(app)/library/actions";

export const metadata: Metadata = { title: "Save as a starter · ferment" };

// A host saves the gathering's design to their own shelf (STARTERS.md §5):
// new, or over a starter they saved from it before.
export default async function SaveStarterPage({ params }: PageProps<"/g/[gathering]/starter">) {
  const { me, gathering, isHost } = await loadGathering((await params).gathering);
  if (!isHost) notFound();
  const viewer = { id: me.id, email: me.email };
  const [before, origin] = await Promise.all([savedFrom(db, gathering.id, me.id), gatheringOrigin(db, gathering.id, viewer)]);
  const base = `/g/${gathering.slug}`;

  return (
    <>
      <Top trail={[{ label: gathering.name, href: base }, { label: "Settings", href: `${base}/settings` }, { label: "Save as a starter" }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-3">
          <h1 className="display text-4xl">Save as a starter</h1>
          <p className="text-[var(--ink-soft)]">
            So you, or anyone you share it with, can start another gathering like this one. It goes on your own shelf, where only you see it.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card space-y-2">
            <p className="label">it keeps</p>
            <ul className="space-y-1 text-sm">
              <li>The welcome note and question</li>
              <li>Each circle&apos;s name, colour and description</li>
              <li>Each circle&apos;s questions, in the order it met them</li>
              <li>The questions to everyone</li>
            </ul>
          </div>
          <div className="card space-y-2">
            <p className="label">it leaves behind</p>
            <ul className="space-y-1 text-sm">
              <li>Everyone in it, and every answer</li>
              <li>Follow-ups, which answer something someone said</li>
              <li>Invitations, seats and harvests</li>
              <li>Closed circles, and questions set aside</li>
            </ul>
          </div>
        </div>
        {origin && (
          <p className="text-sm text-[var(--ink-soft)]">
            It started from <em>{origin.title}</em>, so the new starter is linked to it, and each question to the one it grew from.
          </p>
        )}

        <Form action={saveFromGathering} submit="Save it" pending="Saving…">
          <input type="hidden" name="gathering" value={gathering.slug} />
          {before.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-2 font-medium">Save it as</legend>
              <label className="flex gap-3">
                <input type="radio" name="replace" value="" defaultChecked={false} className="mt-1" />
                <span>A new starter</span>
              </label>
              {before.map((s, i) => (
                <label key={s.id} className="flex gap-3">
                  <input type="radio" name="replace" value={s.id} defaultChecked={i === 0} className="mt-1" />
                  <span>An update to <em>{s.title}</em>, which you saved from here</span>
                </label>
              ))}
            </fieldset>
          )}
          <Field label="Title" name="title" required maxLength={80} defaultValue={before[0]?.title ?? gathering.name} />
          <Field label="What it's for" name="summary" multiline rows={3} maxLength={500} defaultValue={before[0]?.summary ?? ""}
            hint="Who it suits, and what people will talk about. It's what the card says." />
        </Form>
      </main>
    </>
  );
}
