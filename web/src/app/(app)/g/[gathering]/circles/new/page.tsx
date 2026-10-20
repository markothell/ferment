import type { Metadata } from "next";
import { db } from "@/db";
import { promptById } from "@/domain/prompts";
import { loadGathering } from "@/lib/gathering";
import { ColorPicker } from "@/components/app/ColorPicker";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { Top } from "@/components/app/Top";
import { proposeCircle } from "../../actions";

export const metadata: Metadata = { title: "Propose a circle · ferment" };

export default async function NewCirclePage({ params, searchParams }: PageProps<"/g/[gathering]/circles/new">) {
  const { gathering } = await loadGathering((await params).gathering);
  const { prompt: promptId } = await searchParams;
  const around = typeof promptId === "string" ? await promptById(db, promptId) : null;
  const prompt = around && around.gatheringId === gathering.id ? around : null;
  return (
    <>
      <Top trail={[{ label: gathering.name, href: `/g/${gathering.slug}` }, { label: "Propose a circle" }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="display text-4xl">{prompt ? "Start a circle around this" : "Propose a circle"}</h1>
          <p className="text-[var(--ink-soft)]">
            It begins when four people are in, and holds up to twelve. If it hasn&apos;t filled in {gathering.proposalExpiryDays} days, it lapses.
          </p>
        </div>
        <Form action={proposeCircle} submit="Propose" pending="Proposing…">
          <input type="hidden" name="gathering" value={gathering.slug} />
          <Field label="Name" name="name" required maxLength={60} />
          <Field label="What it's for" name="description" multiline maxLength={500} placeholder="Optional" />
          {prompt ? (
            <div className="card space-y-1">
              <input type="hidden" name="prompt" value={prompt.id} />
              <span className="label">its first question</span>
              <p className="text-lg leading-snug">{prompt.question}</p>
            </div>
          ) : (
            <Field label="Its first question" name="question" maxLength={200} placeholder="Optional" />
          )}
          <ColorPicker />
        </Form>
      </main>
    </>
  );
}
