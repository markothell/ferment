"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { circleById, setCircleColor } from "@/domain/circles";
import { attempt, type ActionState } from "@/lib/actions";
import { loadGathering } from "@/lib/gathering";

const str = (form: FormData, key: string) => String(form.get(key) ?? "");

export async function circleColor(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGathering(str(form, "gathering"));
  const circle = await circleById(db, str(form, "circle"));
  if (!circle || circle.gatheringId !== gathering.id) return { error: "That circle isn't here." };
  const failed = await attempt(() => setCircleColor(db, { circleId: circle.id, userId: me.id, color: str(form, "color") }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: "Saved." };
}
