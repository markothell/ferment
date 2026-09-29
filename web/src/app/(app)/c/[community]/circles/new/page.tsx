import type { Metadata } from "next";
import { loadCommunity } from "@/lib/community";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { Top } from "@/components/app/Top";
import { proposeCircle } from "../../actions";

export const metadata: Metadata = { title: "Propose a circle · ferment" };

export default async function NewCirclePage({ params }: PageProps<"/c/[community]/circles/new">) {
  const { community } = await loadCommunity((await params).community);
  return (
    <>
      <Top trail={[{ label: community.name, href: `/c/${community.slug}` }, { label: "Propose a circle" }]} />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="display text-4xl">Propose a circle</h1>
          <p className="text-[var(--ink-soft)]">
            It begins when four people are in, and holds up to twelve. If it hasn&apos;t filled in {community.proposalExpiryDays} days, it lapses.
          </p>
        </div>
        <Form action={proposeCircle} submit="Propose" pending="Proposing…">
          <input type="hidden" name="community" value={community.slug} />
          <Field label="Name" name="name" required maxLength={60} />
          <Field label="What it's for" name="description" multiline maxLength={500} placeholder="Optional" />
          <Field label="Its first question" name="question" maxLength={200} placeholder="Optional" />
        </Form>
      </main>
    </>
  );
}
