// Who may receive a sign-in link. Anyone may (STARTERS.md §6): starting a
// gathering is open, and joining someone else's still takes their invitation.
// Each link is an email, so asks are capped per address, and across addresses
// with no account yet, so the form can't be used to send mail at scale. A
// capped ask gets the same "check your email" screen and no mail.
//
// The caps are counted per asker too, by IP, so one asker can't spend them
// for someone else: asking five times for your address locks out only the
// asker, and one asker can claim only a share of the hour's new accounts. A
// looser cap on the address from everyone together still keeps one inbox
// from being flooded. Asks with no IP fall back to the address alone.
//
// FERMENT_HOST_EMAILS names the curators: who may publish starters to the
// library. It also says who reads /contact when nothing else does.

import { and, count, eq, gt, type SQL } from "drizzle-orm";
import type { DB } from "@/db";
import { signInRequests, user } from "@/db/schema";
import { newId } from "./id";

export const LINKS_PER_ADDRESS_PER_HOUR = 5; // from one asker
export const LINKS_TO_ADDRESS_PER_HOUR = 20; // from everyone
export const LINKS_PER_IP_PER_HOUR = 20;
export const NEW_ADDRESSES_PER_IP_PER_HOUR = 10;
export const NEW_ADDRESSES_PER_HOUR = 60;
const HOUR_MS = 3_600_000;

/** The asker's IP, as Vercel reports it. Null when the request doesn't say. */
export function requesterIp(headers: Headers | null | undefined): string | null {
  const ip = headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || headers?.get("x-real-ip")?.trim();
  return ip || null;
}

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
export async function maySignIn(db: DB, rawEmail: string, ip: string | null, now = new Date()): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  const hourAgo = new Date(now.getTime() - HOUR_MS);
  const asks = async (...where: SQL[]) => {
    const [{ n }] = await db.select({ n: count() }).from(signInRequests).where(and(gt(signInRequests.createdAt, hourAgo), ...where));
    return n;
  };

  // The asker first: an ask refused here isn't counted, so it can't use up anyone else's cap.
  if (ip && (await asks(eq(signInRequests.ip, ip))) >= LINKS_PER_IP_PER_HOUR) return false;

  const toAddress = eq(signInRequests.email, email);
  if (ip) {
    if ((await asks(toAddress, eq(signInRequests.ip, ip))) >= LINKS_PER_ADDRESS_PER_HOUR) return false;
    if ((await asks(toAddress)) >= LINKS_TO_ADDRESS_PER_HOUR) return false;
  } else if ((await asks(toAddress)) >= LINKS_PER_ADDRESS_PER_HOUR) return false;

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  const newAccount = !existing && !curators().has(email);
  if (newAccount) {
    const isNew = eq(signInRequests.newAccount, true);
    if (ip && (await asks(isNew, eq(signInRequests.ip, ip))) >= NEW_ADDRESSES_PER_IP_PER_HOUR) return false;
    if ((await asks(isNew)) >= NEW_ADDRESSES_PER_HOUR) return false;
  }

  await db.insert(signInRequests).values({ id: newId(), email, ip, newAccount, createdAt: now });
  return true;
}
