import type { Metadata } from "next";
import Link from "next/link";
import { loadCommunity } from "@/lib/community";
import { ConfirmForm } from "@/components/app/ConfirmForm";
import { Form } from "@/components/app/Form";
import { Top } from "@/components/app/Top";
import { archive, emailPref } from "../actions";

export const metadata: Metadata = { title: "Settings · ferment" };

export default async function SettingsPage({ params }: PageProps<"/c/[community]/settings">) {
  const { community, isHost, membership } = await loadCommunity((await params).community);
  const base = `/c/${community.slug}`;
  return (
    <>
      <Top trail={[{ label: community.name, href: base }, { label: "Settings" }]} />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <h1 className="display text-4xl">Settings</h1>

        <section id="email" className="scroll-mt-4 space-y-3">
          <h2 className="display text-2xl">Email from {community.name}</h2>
          <Form action={emailPref} submit="Save" quiet className="space-y-3">
            <input type="hidden" name="community" value={community.slug} />
            {([
              ["each", "As things happen", "A round opens, answers are revealed, someone answers your question."],
              ["digest", "Once a day", "One email with everything from the day before."],
              ["off", "Never", "Check your inbox here instead."],
            ] as const).map(([value, label, hint]) => (
              <label key={value} className="flex gap-3">
                <input type="radio" name="pref" value={value} defaultChecked={membership.email === value} className="mt-1" />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-sm text-[var(--ink-soft)]">{hint}</span>
                </span>
              </label>
            ))}
          </Form>
        </section>

        {isHost && (
          <section className="space-y-3 border-t border-[var(--rule)] pt-8">
            <span className="label">for hosts</span>
            <Link href={`${base}/setup`} className="card block">
              <span className="block font-medium">Set up {community.name} →</span>
              <span className="block text-sm text-[var(--ink-soft)]">The welcome note and question, first circles, invitations.</span>
            </Link>
          </section>
        )}

        <section className="space-y-3 border-t border-[var(--rule)] pt-8">
          <h2 className="display text-2xl">Your list</h2>
          {membership.archivedAt ? (
            <ConfirmForm action={archive} submit={`Put ${community.name} back on my list`} confirm="It returns to your list of communities." yes="Put it back" doing="Putting back…" final={false}>
              <input type="hidden" name="community" value={community.slug} />
              <input type="hidden" name="archived" value="no" />
            </ConfirmForm>
          ) : (
            <ConfirmForm
              action={archive}
              submit={`Archive ${community.name} from my list`}
              confirm={`It leaves your own list only. ${community.name} and everyone in it carry on as before, you stay a member, and you can put it back from the archived list on your home page.`}
              yes="Archive it" doing="Archiving…" final={false}
            >
              <input type="hidden" name="community" value={community.slug} />
              <input type="hidden" name="archived" value="yes" />
            </ConfirmForm>
          )}
        </section>
      </main>
    </>
  );
}
