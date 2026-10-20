import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { membershipOf } from "@/domain/gatherings";
import { findInvite } from "@/domain/invites";
import { currentSession } from "@/lib/auth";
import { displayName } from "@/lib/session";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { signOut } from "../../home/actions";
import { accept, comeIn } from "./actions";

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
  if (session && (await membershipOf(db, invite.gathering.id, session.user.id))) {
    redirect(`/g/${invite.gathering.slug}`);
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

  // Used already: coming in again is an ordinary sign-in, by email.
  if (invite.state === "accepted" && !session) {
    return (
      <Shell>
        <h1 className="display text-3xl">You&apos;ve already come in with this invitation.</h1>
        <p className="text-[var(--ink-soft)]">
          <Link className="underline" href={`/signin?next=${encodeURIComponent(`/g/${invite.gathering.slug}`)}`}>Sign in</Link> and
          we&apos;ll email you a link.
        </p>
      </Shell>
    );
  }

  const tokenField = <input type="hidden" name="token" value={token} />;
  const from = displayName(invite.inviter);

  return (
    <Shell>
      <div className="space-y-3">
        <h1 className="display text-4xl leading-tight">
          {from} invited you to {invite.circle ? invite.circle.name : invite.gathering.name}.
        </h1>
        {invite.circle && <p className="text-[var(--ink-soft)]">A circle in {invite.gathering.name}.</p>}
        {invite.note && <blockquote className="border-l-2 border-[var(--mine)] pl-4">{invite.note}</blockquote>}
        {invite.gathering.welcomeNote && (
          <p className="whitespace-pre-line text-[var(--ink-soft)]">{invite.gathering.welcomeNote}</p>
        )}
      </div>

      {error === "link" && <p className="text-[var(--mine)]">That didn&apos;t work. Try coming in again.</p>}

      {!session ? (
        <Form action={comeIn} submit="Come in" pending="Coming in…">
          {tokenField}
          <Field label="What should people call you?" name="name" autoComplete="name" maxLength={60} />
          <p className="text-sm text-[var(--ink-soft)]">
            You&apos;ll come in as <span className="mono">{invite.email}</span>. No password: next time, we&apos;ll email you a link.
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
