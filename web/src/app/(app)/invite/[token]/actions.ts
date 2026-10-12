"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { acceptInvite, findInvite } from "@/domain/invites";
import { attempt, type ActionState } from "@/lib/actions";
import { auth, heldLink } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { joinedPath } from "./joined";

/**
 * Signed out, new here: straight in. The invitation was mailed to this address
 * and opening it shows they read that mail, so no second email to confirm it.
 * The link signs them in (creating the account, with their name) and comes
 * back through ./join, which accepts the invitation and takes them to the
 * circle. Someone who already has an account gets that link by email instead
 * (lib/auth.ts#heldLink).
 */
export async function comeIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  const token = String(form.get("token") || "");
  const invite = await findInvite(db, token);
  if (!invite || invite.state !== "pending") return { error: "This invitation can't be used any more." };
  const name = String(form.get("name") || "").trim().slice(0, 60);
  const body = {
    email: invite.email,
    ...(name ? { name } : {}),
    callbackURL: `/invite/${token}/join`,
    errorCallbackURL: `/invite/${token}?error=link`,
  };
  const link = await heldLink(body);
  if (link) redirect(link);
  await auth.api.signInMagicLink({ body, headers: await headers() });
  return { ok: `You already have an account, so we've emailed a link to ${invite.email}. Open it to come in.` };
}

export async function accept(_prev: ActionState, form: FormData): Promise<ActionState> {
  const token = String(form.get("token") || "");
  const me = await requireUser(`/invite/${token}`);
  let to = "/home";
  const failed = await attempt(async () => {
    to = joinedPath(await acceptInvite(db, { token, userId: me.id, userEmail: me.email }));
  });
  if (failed) return failed;
  redirect(to);
}
