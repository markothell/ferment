import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadCommunity } from "@/lib/community";
import { Form } from "@/components/app/Form";
import { PromptFields } from "@/components/app/PromptFields";
import { Top } from "@/components/app/Top";
import { ask } from "../actions";

export const metadata: Metadata = { title: "Ask the community · ferment" };

export default async function AskPage({ params }: PageProps<"/c/[community]/ask">) {
  const { community, isHost } = await loadCommunity((await params).community);
  if (!community.membersPostOpenQuestions && !isHost) notFound();
  return (
    <>
      <Top trail={[{ label: community.name, href: `/c/${community.slug}` }, { label: "Ask" }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="display text-4xl">Ask the community</h1>
          <p className="text-[var(--ink-soft)]">An open question, to everyone in {community.name}. It opens right away.</p>
        </div>
        <Form action={ask} submit="Ask" pending="Asking…">
          <input type="hidden" name="community" value={community.slug} />
          <PromptFields defaultReveal="open" />
        </Form>
      </main>
    </>
  );
}
