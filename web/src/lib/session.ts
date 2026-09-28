import "server-only";

import { redirect } from "next/navigation";
import { currentSession } from "./auth";

export type SessionUser = { id: string; name: string; email: string };

/** Where to send someone after sign-in: same-origin paths only. */
export function safeNext(next: unknown, fallback = "/home"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export async function requireUser(next = "/home"): Promise<SessionUser> {
  const session = await currentSession();
  if (!session) redirect(`/signin?next=${encodeURIComponent(next)}`);
  const { id, name, email } = session.user;
  return { id, name, email };
}

/** A person's name as others see it: their own, or their email's first half. */
export function displayName(u: { name: string | null; email: string }): string {
  return u.name?.trim() || u.email.split("@")[0];
}
