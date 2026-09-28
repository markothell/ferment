"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { circleById, createCircle, joinCircle, leaveCircle, type Circle } from "@/domain/circles";
import { setWelcomeQuestion, updateWelcomeNote } from "@/domain/communities";
import { createInvite } from "@/domain/invites";
import { attempt, type ActionState } from "@/lib/actions";
import { loadCommunity } from "@/lib/community";
import { sendMail } from "@/lib/email";
import { displayName } from "@/lib/session";
import { appUrl } from "@/lib/urls";

const str = (form: FormData, key: string) => String(form.get(key) || "");

export async function saveWelcomeNote(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, community } = await loadCommunity(str(form, "community"));
  const failed = await attempt(() => updateWelcomeNote(db, { communityId: community.id, userId: me.id, note: str(form, "note") }));
  if (failed) return failed;
  revalidatePath(`/c/${community.slug}`, "layout");
  return { ok: "Saved." };
}

export async function saveWelcomeQuestion(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, community } = await loadCommunity(str(form, "community"));
  const failed = await attempt(() =>
    setWelcomeQuestion(db, { communityId: community.id, userId: me.id, question: str(form, "question") }),
  );
  if (failed) return failed;
  revalidatePath(`/c/${community.slug}`, "layout");
  return { ok: "Saved." };
}

export async function proposeCircle(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, community } = await loadCommunity(str(form, "community"));
  let circle: Circle | undefined;
  const failed = await attempt(async () => {
    circle = await createCircle(db, {
      communityId: community.id, userId: me.id,
      name: str(form, "name"), description: str(form, "description"), firstQuestion: str(form, "question"),
    });
  });
  if (failed) return failed;
  revalidatePath(`/c/${community.slug}`, "layout");
  const back = str(form, "back");
  if (back === "setup") return { ok: `${circle!.name} is up. Add another, or move on.` };
  redirect(`/c/${community.slug}/circles/${circle!.slug}`);
}

export async function invite(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, community } = await loadCommunity(str(form, "community"));
  const circleId = str(form, "circle") || null;
  const note = str(form, "note");
  let sent: { token: string; email: string } | undefined;
  const failed = await attempt(async () => {
    sent = await createInvite(db, { communityId: community.id, invitedBy: me.id, email: str(form, "email"), circleId, note });
  });
  if (failed) return failed;

  const from = displayName(me);
  const circle = circleId ? await circleById(db, circleId) : null;
  const lines = [
    circle
      ? `${from} invited you to join ${circle.name}, a circle in ${community.name}.`
      : `${from} invited you to ${community.name}.`,
    note.trim() && `\n"${note.trim()}"`,
    community.welcomeNote && `\n${community.welcomeNote}`,
    `\nCome in: ${appUrl(`/invite/${sent!.token}`)}`,
    `\nThe link is yours alone and works for 30 days.`,
  ].filter(Boolean);
  await sendMail({
    to: sent!.email,
    subject: circle ? `${from} invited you to ${circle.name}` : `${from} invited you to ${community.name}`,
    text: lines.join("\n"),
  });
  return { ok: `Invitation sent to ${sent!.email}.` };
}

export async function join(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, community } = await loadCommunity(str(form, "community"));
  const failed = await attempt(() => joinCircle(db, { circleId: str(form, "circle"), userId: me.id }));
  if (failed) return failed;
  revalidatePath(`/c/${community.slug}`, "layout");
  return undefined;
}

export async function leave(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, community } = await loadCommunity(str(form, "community"));
  await leaveCircle(db, { circleId: str(form, "circle"), userId: me.id });
  revalidatePath(`/c/${community.slug}`, "layout");
  return undefined;
}
