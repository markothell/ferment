"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { circleById } from "@/domain/circles";
import { chooseHarvest, harvestById, proposeHarvest, withdrawFromHarvest } from "@/domain/harvests";
import { attempt, type ActionState } from "@/lib/actions";
import { loadGathering } from "@/lib/gathering";

const str = (form: FormData, key: string) => String(form.get(key) ?? "");

/** The harvest named in the form, if it belongs to this gathering. */
async function load(form: FormData) {
  const { me, gathering } = await loadGathering(str(form, "gathering"));
  const harvest = await harvestById(db, str(form, "harvest"));
  return { me, gathering, harvest: harvest && harvest.toGroupId === gathering.id ? harvest : null };
}

export async function proposeHarvestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGathering(str(form, "gathering"));
  const failed = await attempt(() => proposeHarvest(db, { roundId: str(form, "round"), userId: me.id }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: "Proposed. Everyone who answered will be asked about their own answer." };
}

export async function chooseHarvestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering, harvest } = await load(form);
  if (!harvest) return { error: "That harvest isn't here." };
  const share = str(form, "share") === "yes";
  const failed = await attempt(() => chooseHarvest(db, { harvestId: harvest.id, userId: me.id, share }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: share ? "Yours is in." : "Yours stays in the circle." };
}

export async function withdrawHarvestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering, harvest } = await load(form);
  if (!harvest) return { error: "That harvest isn't here." };
  const failed = await attempt(() => withdrawFromHarvest(db, { harvestId: harvest.id, userId: me.id }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  // From the harvest itself, go back to the circle: the harvest may have come down.
  if (str(form, "from") === "harvest") redirect(`/g/${gathering.slug}/circles/${(await circleById(db, harvest.groupId))!.slug}`);
  return { ok: "Taken out. Inside the circle, nothing changed." };
}
