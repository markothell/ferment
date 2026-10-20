import type { Metadata } from "next";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { Top } from "@/components/app/Top";
import { requireUser } from "@/lib/session";
import { startGathering } from "./actions";

export const metadata: Metadata = { title: "Start a gathering · ferment" };

export default async function NewGatheringPage() {
  await requireUser("/new");
  return (
    <>
      <Top />
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="display text-4xl">Start a gathering</h1>
          <p className="text-[var(--ink-soft)]">
            A home for up to 100 people. Next you&apos;ll set a welcome question and a few circles to join, then invite people.
          </p>
        </div>
        <Form action={startGathering} submit="Create" pending="Creating…">
          <Field label="Name" name="name" required maxLength={60} placeholder="Tuesday Tables" />
          <Field
            label="Welcome note"
            name="note"
            multiline
            maxLength={2000}
            hint="What this group is and why it's here. The first thing an invitee reads. You can change it later."
          />
        </Form>
      </main>
    </>
  );
}
