import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadGroup } from "@/lib/group";
import { Form } from "@/components/app/Form";
import { PromptFields } from "@/components/app/PromptFields";
import { Top } from "@/components/app/Top";
import { ask } from "../actions";

export const metadata: Metadata = { title: "Ask the gathering · ferment" };

export default async function AskPage({ params }: PageProps<"/g/[group]/ask">) {
  const { gathering, isHost } = await loadGroup((await params).group);
  if (!gathering.membersPostOpenQuestions && !isHost) notFound();
  return (
    <>
      <Top trail={[{ label: gathering.name, href: `/g/${gathering.slug}` }, { label: "Ask" }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="display text-4xl">Ask the gathering</h1>
          <p className="text-[var(--ink-soft)]">An open question, to everyone in {gathering.name}. It opens right away.</p>
        </div>
        <Form action={ask} submit="Ask" pending="Asking…">
          <input type="hidden" name="gathering" value={gathering.slug} />
          <PromptFields defaultReveal="open" />
        </Form>
      </main>
    </>
  );
}
