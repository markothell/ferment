import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { membershipOf } from "@/domain/communities";
import { findInvite } from "@/domain/invites";
import { currentSession } from "@/lib/auth";
import { displayName } from "@/lib/session";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { signOut } from "../../home/actions";
import { accept, sendInviteLink } from "./actions";

export const metadata: Metadata = { title: "You're invited · ferment" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center space-y-6 px-4 py-12">
      <p className="text-xl font-medium tracking-tight">ferment</p>
      {children}
    </main>
  );
}

export default async function AcceptInvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { error } = await searchParams;
  const invite = await findInvite(db, token);
  const session = await currentSession();

  if (!invite) {
    return <Shell><h1 className="display text-3xl">This invitation link isn&apos;t valid.</h1></Shell>;
  }

  // Already in: straight through.
  if (session && (await membershipOf(db, invite.community.id, session.user.id))) {
    redirect(`/c/${invite.community.slug}`);
  }

  if (invite.state === "expired" || invite.state === "revoked") {
    return (
      <Shell>
        <h1 className="display text-3xl">
          {invite.state === "expired" ? "This invitation has expired." : "This invitation was replaced by a newer one."}
        </h1>
        <p className="text-[var(--ink-soft)]">Ask {displayName(invite.inviter)} for a fresh one.</p>
      </Shell>
    );
  }

  const tokenField = <input type="hidden" name="token" value={token} />;
  const from = displayName(invite.inviter);

  return (
    <Shell>
      <div className="space-y-3">
        <h1 className="display text-4xl leading-tight">
          {from} invited you to {invite.circle ? invite.circle.name : invite.community.name}.
        </h1>
        {invite.circle && <p className="text-[var(--ink-soft)]">A circle in {invite.community.name}.</p>}
        {invite.note && <blockquote className="border-l-2 border-[var(--mine)] pl-4">{invite.note}</blockquote>}
        {invite.community.welcomeNote && (
          <p className="whitespace-pre-line text-[var(--ink-soft)]">{invite.community.welcomeNote}</p>
        )}
      </div>

      {error === "link" && <p className="text-[var(--mine)]">That sign-in link expired. Send yourself a new one.</p>}

      {!session ? (
        <Form action={sendInviteLink} submit="Come in" pending="Sending…">
          {tokenField}
          <Field label="What should people call you?" name="name" autoComplete="name" maxLength={60} />
          <p className="text-sm text-[var(--ink-soft)]">
            We&apos;ll email a link to <span className="mono">{invite.email}</span> to confirm it&apos;s you. No password.
          </p>
        </Form>
      ) : session.user.email.toLowerCase() !== invite.email ? (
        <div className="space-y-4">
          <p>
            This invitation is for <span className="mono">{invite.email}</span>, and you&apos;re signed in as{" "}
            <span className="mono">{session.user.email}</span>.
          </p>
          <form action={signOut}><button className="button-quiet" type="submit">Sign out</button></form>
        </div>
      ) : (
        <Form action={accept} submit="Come in" pending="Coming in…">{tokenField}</Form>
      )}
    </Shell>
  );
}
