import type { Metadata } from "next";
import { MESSAGE_MAX } from "@/domain/contact";
import { currentSession } from "@/lib/auth";
import { Top } from "@/components/app/Top";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "Get in touch · ferment" };

// Open to everyone: linked from account settings and the homepage's footer.
export default async function ContactPage() {
  const session = await currentSession();
  return (
    <>
      <Top trail={[{ label: "Get in touch" }]} />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <h1 className="display text-4xl">Get in touch</h1>
        <p className="text-[var(--ink-soft)]">
          A question, an idea, or something that broke. This reaches the person who makes ferment.
        </p>
        <ContactForm from={session?.user.email ?? null} max={MESSAGE_MAX} />
      </main>
    </>
  );
}
