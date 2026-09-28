"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { acceptInvite, findInvite } from "@/domain/invites";
import { attempt, type ActionState } from "@/lib/actions";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";

/** Signed out: send a sign-in link to the invited address, returning here. */
export async function sendInviteLink(_prev: ActionState, form: FormData): Promise<ActionState> {
  const token = String(form.get("token") || "");
  const invite = await findInvite(db, token);
  if (!invite || invite.state !== "pending") return { error: "This invitation can't be used any more." };
  const name = String(form.get("name") || "").trim().slice(0, 60);
  await auth.api.signInMagicLink({
    body: {
      email: invite.email,
      ...(name ? { name } : {}),
      callbackURL: `/invite/${token}`,
      errorCallbackURL: `/invite/${token}?error=link`,
    },
    headers: await headers(),
  });
  return { ok: `We've sent a link to ${invite.email}. Open it to come in.` };
}

export async function accept(_prev: ActionState, form: FormData): Promise<ActionState> {
  const token = String(form.get("token") || "");
  const me = await requireUser(`/invite/${token}`);
  let to = "/home";
  const failed = await attempt(async () => {
    const r = await acceptInvite(db, { token, userId: me.id, userEmail: me.email });
    to = r.joinedCircle && r.circleSlug ? `/c/${r.communitySlug}/circles/${r.circleSlug}` : `/c/${r.communitySlug}`;
  });
  if (failed) return failed;
  redirect(to);
}
