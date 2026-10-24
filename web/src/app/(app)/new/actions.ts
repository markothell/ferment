"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { createLoneCircle } from "@/domain/circles";
import { createGathering, type Gathering } from "@/domain/gatherings";
import { startFromStarter } from "@/domain/starters";
import { attempt, type ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/session";

/** Start a circle on its own: a name, a first question, then invite a few people. */
export async function startCircle(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireUser("/new");
  let created: { slug: string } | undefined;
  const failed = await attempt(async () => {
    created = await createLoneCircle(db, {
      userId: me.id, name: String(form.get("name") || ""), description: String(form.get("description") || ""),
      firstQuestion: String(form.get("question") || ""),
    });
  });
  if (failed) return failed;
  redirect(`/g/${created!.slug}`);
}

/** Start a gathering, from a starter or from nothing, then set it up. */
export async function startGathering(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireUser("/new");
  const starterId = String(form.get("starter") || "");
  const name = String(form.get("name") || "");
  const welcomeNote = String(form.get("note") || "");
  let created: Gathering | undefined;
  const failed = await attempt(async () => {
    created = starterId
      ? await startFromStarter(db, { starterId, viewer: { id: me.id, email: me.email }, name, welcomeNote })
      : await createGathering(db, { userId: me.id, name, welcomeNote });
  });
  if (failed) return failed;
  redirect(`/g/${created!.slug}/setup`);
}
