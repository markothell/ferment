import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentSession } from "@/lib/auth";

export const metadata: Metadata = { title: "ferment" };

async function signOut() {
  "use server";
  await auth.api.signOut({ headers: await headers() });
  redirect("/signin");
}

export default async function HomePage() {
  const session = await currentSession();
  if (!session) redirect("/signin");

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <p className="mb-10 text-xl font-medium tracking-tight">ferment</p>
      <h1 className="display mb-3 text-4xl">You&apos;re in.</h1>
      <p className="mb-10 text-[var(--ink-soft)]">
        Signed in as <span className="mono">{session.user.email}</span>. Communities come next.
      </p>
      <form action={signOut}>
        <button className="link" type="submit">Sign out</button>
      </form>
    </main>
  );
}
