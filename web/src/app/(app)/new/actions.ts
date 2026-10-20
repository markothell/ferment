"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { createGathering, type Gathering } from "@/domain/gatherings";
import { startFromStarter } from "@/domain/starters";
import { attempt, type ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/session";

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
