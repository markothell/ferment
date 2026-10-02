"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { circleById, setCircleColor } from "@/domain/circles";
import { attempt, type ActionState } from "@/lib/actions";
import { loadCommunity } from "@/lib/community";

const str = (form: FormData, key: string) => String(form.get(key) ?? "");

export async function circleColor(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, community } = await loadCommunity(str(form, "community"));
  const circle = await circleById(db, str(form, "circle"));
  if (!circle || circle.communityId !== community.id) return { error: "That circle isn't here." };
  const failed = await attempt(() => setCircleColor(db, { circleId: circle.id, userId: me.id, color: str(form, "color") }));
  if (failed) return failed;
  revalidatePath(`/c/${community.slug}`, "layout");
  return { ok: "Saved." };
}
