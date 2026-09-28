import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in · ferment" };

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  if (await currentSession()) redirect("/home");
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <p className="mb-10 text-xl font-medium tracking-tight">ferment</p>
      <h1 className="display mb-3 text-4xl leading-tight">Welcome back.</h1>
      <p className="mb-8 text-[var(--ink-soft)]">No password. We&apos;ll email you a link.</p>
      {error === "link" && (
        <p className="mb-6 text-[var(--mine)]">That link has expired or was already used. Ask for a new one.</p>
      )}
      <SignInForm />
    </main>
  );
}
