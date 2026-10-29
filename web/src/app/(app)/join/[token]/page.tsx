import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { membershipOf } from "@/domain/gatherings";
import { findJoinLink } from "@/domain/joinLinks";
import { currentSession } from "@/lib/auth";
import { displayName } from "@/lib/session";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { askLink, join } from "./actions";

export const metadata: Metadata = { title: "Come in · ferment" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center space-y-6 px-4 py-12">
      <p className="text-xl font-medium tracking-tight">ferment</p>
      {children}
    </main>
  );
}

// Where a shared link lands (GROUPS.md §10): what it opens onto, then one
// step in. Signed out, a sign-in link by email comes back here; signed in,
// one button.
export default async function JoinPage({ params, searchParams }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const { error } = await searchParams;
  const [link, session] = await Promise.all([findJoinLink(db, token), currentSession()]);

  if (!link) {
    return (
      <Shell>
        <h1 className="display text-3xl">This link isn&apos;t valid.</h1>
        <p className="text-[var(--ink-soft)]">It may have been replaced. Ask whoever shared it for the current one.</p>
      </Shell>
    );
  }
  if (session && (await membershipOf(db, link.group.id, session.user.id))) redirect(`/g/${link.group.slug}`);

  const host = link.host ? displayName(link.host) : "the host";
  if (!link.open) {
    return (
      <Shell>
        <h1 className="display text-3xl">{link.group.name} isn&apos;t taking people in by this link right now.</h1>
        <p className="text-[var(--ink-soft)]">Ask {host} to open it again.</p>
      </Shell>
    );
  }

  const tokenField = <input type="hidden" name="token" value={token} />;
  const circle = link.group.kind === "circle";
  return (
    <Shell>
      <div className="space-y-3">
        <h1 className="display text-4xl leading-tight">{host} invites you to {link.group.name}.</h1>
        <p className="text-[var(--ink-soft)]">
          {circle
            ? "A circle: a few people around one question at a time. Everyone answers once, in their own voice."
            : "A gathering: a few circles and the people not yet in one, with a question to everyone at the centre."}
        </p>
        {link.group.welcomeNote && <p className="whitespace-pre-line text-[var(--ink-soft)]">{link.group.welcomeNote}</p>}
      </div>

      {error === "link" && <p className="text-[var(--mine)]">That sign-in link has expired or was already used. Ask for another below.</p>}

      {!session ? (
        <Form action={askLink} submit="Email me a link" pending="Sending…">
          {tokenField}
          <Field label="Your email" name="email" type="email" required autoComplete="email" />
          <Field label="What should people call you?" name="name" autoComplete="name" maxLength={60} />
          <p className="text-sm text-[var(--ink-soft)]">No password. The link signs you in and brings you back here.</p>
        </Form>
      ) : (
        <Form action={join} submit={`Come in as ${displayName(session.user)}`} pending="Coming in…">{tokenField}</Form>
      )}
    </Shell>
  );
}
