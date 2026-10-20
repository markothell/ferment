"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { createGathering, type Gathering } from "@/domain/gatherings";
import { attempt, type ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/session";

export async function startGathering(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireUser("/new");
  let created: Gathering | undefined;
  const failed = await attempt(async () => {
    created = await createGathering(db, {
      userId: me.id, userEmail: me.email,
      name: String(form.get("name") || ""), welcomeNote: String(form.get("note") || ""),
    });
  });
  if (failed) return failed;
  redirect(`/g/${created!.slug}/setup`);
}
