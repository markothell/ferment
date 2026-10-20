import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { listMyGatherings } from "@/domain/gatherings";
import { mayView, starterBySlug, starterLineage } from "@/domain/starters";
import { isCurator } from "@/lib/access";
import { currentSession } from "@/lib/auth";
import { ConfirmForm } from "@/components/app/ConfirmForm";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { StarterOutline } from "@/components/app/StarterOutline";
import { Top } from "@/components/app/Top";
import { addToGathering, copy, describe, publish, remove } from "../actions";

export async function generateMetadata({ params }: PageProps<"/library/[starter]">): Promise<Metadata> {
  const s = await starterBySlug(db, (await params).starter);
  return { title: `${s?.visibility === "published" ? s.title : "A starter"} · ferment` };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// One starter, whole, before anyone signs in (STARTERS.md §5): its design,
// where it came from and where it has gone, and the ways to use it.
export default async function StarterPage({ params }: PageProps<"/library/[starter]">) {
  const slug = (await params).starter;
  const [starter, session] = await Promise.all([starterBySlug(db, slug), currentSession()]);
  const viewer = session ? { id: session.user.id, email: session.user.email } : null;
  if (!starter || !mayView(starter, viewer)) notFound();

  const [lineage, gatherings] = await Promise.all([
    starterLineage(db, starter, viewer),
    viewer ? listMyGatherings(db, viewer.id) : Promise.resolve([]),
  ]);
  const hosted = gatherings.filter((g) => g.role === "host");
  const mine = viewer !== null && starter.authorId === viewer.id;
  const curator = viewer !== null && isCurator(viewer.email);
  const startHref = `/new?starter=${starter.slug}`;
  const hidden = <input type="hidden" name="starter" value={starter.id} />;

  return (
    <>
      <Top
        trail={[{ label: "Starters", href: "/library" }, ...(mine ? [{ label: "Yours", href: "/library/mine" }] : []), { label: starter.title }]}
        links={viewer ? [] : [{ label: "Sign in", href: `/signin?next=/library/${starter.slug}` }]}
      />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <header className="space-y-3">
          <p className="label">
            {lineage.by === "ferment" ? "from ferment" : `by ${lineage.by}`}
            {starter.visibility === "private" && " · only you see this"}
          </p>
          <h1 className="display text-4xl">{starter.title}</h1>
          {starter.summary && <p className="text-lg text-[var(--ink-soft)]">{starter.summary}</p>}
          <div className="space-y-3 pt-2">
            <Link href={viewer ? startHref : `/signin?next=${encodeURIComponent(startHref)}`} className="button">
              Start a gathering with this
            </Link>
            <p className="text-sm text-[var(--ink-soft)]">
              You&apos;ll host it. Nobody is invited until you say so, and you can change anything first.
            </p>
          </div>
        </header>

        <StarterOutline content={starter.content} />

        <section className="space-y-3 border-t border-[var(--rule)] pt-8">
          <h2 className="display text-2xl">Where it comes from</h2>
          {lineage.ancestors.length === 0 ? (
            <p className="text-[var(--ink-soft)]">
              {lineage.by === "ferment" ? "Written by ferment from the sources named in its questions." : `Made by ${lineage.by}.`}
            </p>
          ) : (
            <ol className="space-y-1">
              {lineage.ancestors.map((a, i) => (
                <li key={i} className="flex gap-2" style={{ marginLeft: `${i * 1.25}rem` }}>
                  <span className="text-[var(--ink-faint)]" aria-hidden>↳</span>
                  <span>
                    {i === 0 ? "Grew out of " : "which grew out of "}
                    {a.slug ? <Link href={`/library/${a.slug}`} className="link">{a.title}</Link> : <span>{a.title}</span>}
                    {a.by && <span className="text-[var(--ink-soft)]">{a.by === "ferment" ? ", from ferment" : `, by ${a.by}`}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}

          <h2 className="display pt-4 text-2xl">Where it has gone</h2>
          <p className="text-[var(--ink-soft)]">
            {lineage.started === 0
              ? "No gatherings have started from it yet."
              : `It has started ${plural(lineage.started, "gathering")}, and its questions have opened ${plural(lineage.opened, "time")} there.`}
          </p>
          {lineage.copies.length > 0 && (
            <ul className="space-y-1">
              {lineage.copies.map((c) => (
                <li key={c.slug}>
                  <Link href={`/library/${c.slug}`} className="link">{c.title}</Link>
                  <span className="text-[var(--ink-soft)]"> {c.mine ? "(your copy)" : `by ${c.by}`}</span>
                </li>
              ))}
            </ul>
          )}
          {lineage.otherCopies > 0 && (
            <p className="text-sm text-[var(--ink-soft)]">
              {lineage.copies.length ? "And " : ""}{plural(lineage.otherCopies, "private copy", "private copies")} that people keep for themselves.
            </p>
          )}
        </section>

        {viewer && (
          <section className="space-y-6 border-t border-[var(--rule)] pt-8">
            {hosted.length > 0 && (
              <div className="space-y-3">
                <h2 className="display text-2xl">Add it to a gathering you host</h2>
                <p className="text-[var(--ink-soft)]">
                  Its circles and questions to everyone join what&apos;s already there. Your welcome note and question stay as they are, if you have them.
                </p>
                <Form action={addToGathering} submit="Add it" pending="Adding…" quiet>
                  {hidden}
                  <select name="gathering" className="field" aria-label="Gathering">
                    {hosted.map((g) => <option key={g.id} value={g.slug}>{g.name}</option>)}
                  </select>
                </Form>
              </div>
            )}
            <div className="space-y-3">
              <h2 className="display text-2xl">Copy it to your starters</h2>
              <p className="text-[var(--ink-soft)]">A copy of your own, linked back to this one. Start gatherings from it and save your changes over it.</p>
              <Form action={copy} submit="Copy to your starters" pending="Copying…" quiet>{hidden}</Form>
            </div>
          </section>
        )}

        {mine && (
          <section className="space-y-4 border-t border-[var(--rule)] pt-8">
            <h2 className="display text-2xl">Yours to change</h2>
            <Form action={describe} submit="Save" quiet>
              {hidden}
              <Field label="Title" name="title" required maxLength={80} defaultValue={starter.title} />
              <Field label="What it's for" name="summary" multiline rows={3} maxLength={500} defaultValue={starter.summary}
                hint="What the card says. Who it suits, and what people will talk about." />
            </Form>
            <p className="text-sm text-[var(--ink-soft)]">
              To change its circles or questions, start a gathering from it, change them there, and save that gathering over this starter from its settings.
            </p>
            {starter.visibility === "private" && (
              <ConfirmForm action={remove} submit="Delete this starter" confirm="This deletes the starter. Gatherings started from it carry on, and copies keep its title.">
                {hidden}
              </ConfirmForm>
            )}
          </section>
        )}

        {curator && (mine || starter.authorId === null || starter.visibility === "published") && (
          <section className="space-y-3 border-t border-[var(--rule)] pt-8">
            <span className="label">for curators</span>
            <Form action={publish} submit={starter.visibility === "published" ? "Take it out of the library" : "Put it in the library"} quiet>
              {hidden}
              <input type="hidden" name="published" value={starter.visibility === "published" ? "no" : "yes"} />
            </Form>
          </section>
        )}
      </main>
    </>
  );
}
