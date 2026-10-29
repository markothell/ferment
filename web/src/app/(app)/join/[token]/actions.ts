"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/db";
import { findJoinLink, joinByLink } from "@/domain/joinLinks";
import { normalizeEmail } from "@/lib/access";
import { attempt, type ActionState } from "@/lib/actions";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";

/**
 * Signed out: a sign-in link by email, which comes back here. Nothing is
 * held (lib/auth.ts#heldLink) since anyone may hold this link: the address
 * has to be read before anyone comes in as it.
 */
export async function askLink(_prev: ActionState, form: FormData): Promise<ActionState> {
  const token = String(form.get("token") || "");
  const link = await findJoinLink(db, token);
  if (!link || !link.open) return { error: "This link can't be used right now." };
  const parsed = z.email().safeParse(String(form.get("email") || "").trim());
  if (!parsed.success) return { error: "That doesn't look like an email address." };
  const email = normalizeEmail(parsed.data);
  const name = String(form.get("name") || "").trim().slice(0, 60);
  // Same answer whether or not a link was sent (lib/access.ts).
  await auth.api.signInMagicLink({
    body: { email, ...(name ? { name } : {}), callbackURL: `/join/${token}`, errorCallbackURL: `/join/${token}?error=link` },
    headers: await headers(),
  });
  return { ok: `We've emailed a link to ${email}. Open it and you're in.` };
}

export async function join(_prev: ActionState, form: FormData): Promise<ActionState> {
  const token = String(form.get("token") || "");
  const me = await requireUser(`/join/${token}`);
  let to = "/home";
  const failed = await attempt(async () => {
    to = `/g/${(await joinByLink(db, { token, userId: me.id })).slug}`;
  });
  if (failed) return failed;
  redirect(to);
}
