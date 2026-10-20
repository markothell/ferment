import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { gatheringHome } from "@/domain/gatherings";
import { promptById } from "@/domain/prompts";
import { loadGathering } from "@/lib/gathering";
import { Form } from "@/components/app/Form";
import { PromptFields } from "@/components/app/PromptFields";
import { Top } from "@/components/app/Top";
import { adapt } from "../../actions";

export const metadata: Metadata = { title: "Adapt a question · ferment" };

export default async function AdaptPage({ params }: PageProps<"/g/[gathering]/adapt/[prompt]">) {
  const p = await params;
  const { me, gathering, isHost } = await loadGathering(p.gathering);
  const parent = await promptById(db, p.prompt);
  if (!parent || parent.gatheringId !== gathering.id) notFound();
  const home = await gatheringHome(db, gathering, me.id);
  const mine = home.circles.filter((c) => c.isMember);
  const mayAsk = gathering.membersPostOpenQuestions || isHost;

  return (
    <>
      <Top trail={[{ label: gathering.name, href: `/g/${gathering.slug}` }, { label: "What we're talking about", href: `/g/${gathering.slug}/feed` }, { label: "Adapt" }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="display text-4xl">Adapt a question</h1>
          <p className="text-[var(--ink-soft)]">
            Change what you need. Yours will be linked to “{parent.question}”, so people can see where it came from.
          </p>
        </div>
        {mine.length === 0 && !mayAsk ? (
          <p className="text-[var(--ink-soft)]">Join a circle first, then you can take a question there.</p>
        ) : (
          <Form action={adapt} submit="Adapt it" pending="Adapting…">
            <input type="hidden" name="gathering" value={gathering.slug} />
            <input type="hidden" name="parent" value={parent.id} />
            <PromptFields
              defaults={{
                question: parent.question, context: parent.context, shape: parent.shape,
                telling: parent.telling, reveal: parent.reveal, axes: parent.axes, placing: parent.placing,
                seedWords: parent.seedWords, pickMax: parent.pickMax, coinMax: parent.coinMax,
              }}
            />
            <label className="block space-y-2">
              <span className="block font-medium">Where it goes</span>
              <select name="to" className="field" defaultValue={mine[0]?.id ?? "everyone"}>
                {mine.map((c) => <option key={c.id} value={c.id}>Suggest to {c.name}</option>)}
                {mayAsk && <option value="everyone">Ask everyone in {gathering.name}</option>}
              </select>
            </label>
          </Form>
        )}
      </main>
    </>
  );
}
