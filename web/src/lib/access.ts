// Who may receive a sign-in link. Ferment is invite-only (PLAN §4): a link
// goes to someone who already has an account, holds a live invitation, or is
// on the host allowlist (people who may start a gathering). Anyone else gets
// the same "check your email" screen and no mail, so the form can't be used
// to find out who is here.

import { and, eq, gt } from "drizzle-orm";
import type { DB } from "@/db";
import { invites, user } from "@/db/schema";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hostAllowlist(env = process.env.FERMENT_HOST_EMAILS): Set<string> {
  return new Set((env || "").split(",").map(normalizeEmail).filter(Boolean));
}

export async function maySignIn(db: DB, rawEmail: string, now = new Date()): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (hostAllowlist().has(email)) return true;

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing) return true;

  const [invited] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.email, email), eq(invites.status, "pending"), gt(invites.expiresAt, now)))
    .limit(1);
  return Boolean(invited);
}
