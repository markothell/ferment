"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { createCommunity, type Community } from "@/domain/communities";
import { attempt, type ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/session";

export async function startCommunity(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireUser("/new");
  let created: Community | undefined;
  const failed = await attempt(async () => {
    created = await createCommunity(db, {
      userId: me.id, userEmail: me.email,
      name: String(form.get("name") || ""), welcomeNote: String(form.get("note") || ""),
    });
  });
  if (failed) return failed;
  redirect(`/c/${created!.slug}/setup`);
}
