// Who may receive a sign-in link. Anyone may (STARTERS.md §6): starting a
// gathering is open, and joining someone else's still takes their invitation.
// Each link is an email, so asks are capped per address, and across addresses
// with no account yet, so the form can't be used to send mail at scale. A
// capped ask gets the same "check your email" screen and no mail.
//
// FERMENT_HOST_EMAILS names the curators: who may publish starters to the
// library. It also says who reads /contact when nothing else does.

import { and, count, eq, gt } from "drizzle-orm";
import type { DB } from "@/db";
import { signInRequests, user } from "@/db/schema";
import { newId } from "./id";

export const LINKS_PER_ADDRESS_PER_HOUR = 5;
export const NEW_ADDRESSES_PER_HOUR = 60;
const HOUR_MS = 3_600_000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function curators(env = process.env.FERMENT_HOST_EMAILS): Set<string> {
  return new Set((env || "").split(",").map(normalizeEmail).filter(Boolean));
}

export function isCurator(email: string): boolean {
  return curators().has(normalizeEmail(email));
}

/** Whether to send this link, counting it if so. */
export async function maySignIn(db: DB, rawEmail: string, now = new Date()): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  const hourAgo = new Date(now.getTime() - HOUR_MS);

  const [{ mine }] = await db
    .select({ mine: count() })
    .from(signInRequests)
    .where(and(eq(signInRequests.email, email), gt(signInRequests.createdAt, hourAgo)));
  if (mine >= LINKS_PER_ADDRESS_PER_HOUR) return false;

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  const newAccount = !existing && !curators().has(email);
  if (newAccount) {
    const [{ all }] = await db
      .select({ all: count() })
      .from(signInRequests)
      .where(and(eq(signInRequests.newAccount, true), gt(signInRequests.createdAt, hourAgo)));
    if (all >= NEW_ADDRESSES_PER_HOUR) return false;
  }

  await db.insert(signInRequests).values({ id: newId(), email, newAccount, createdAt: now });
  return true;
}
