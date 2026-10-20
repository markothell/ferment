"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { gatheringBySlug } from "@/domain/gatherings";
import {
  addStarter, copyStarter, deleteStarter, describeStarter, saveStarter, setPublished, starterById, type Starter,
} from "@/domain/starters";
import { attempt, type ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/session";

const str = (form: FormData, key: string) => String(form.get(key) || "");

async function viewer(back: string) {
  const me = await requireUser(back);
  return { id: me.id, email: me.email };
}

/** Copy a starter onto your shelf, then open the copy. */
export async function copy(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await viewer("/library");
  let made: Starter | undefined;
  const failed = await attempt(async () => {
    made = await copyStarter(db, { starterId: str(form, "starter"), viewer: me });
  });
  if (failed) return failed;
  revalidatePath("/library", "layout");
  redirect(`/library/${made!.slug}`);
}

export async function describe(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await viewer("/library/mine");
  const failed = await attempt(() =>
    describeStarter(db, { starterId: str(form, "starter"), userId: me.id, title: str(form, "title"), summary: str(form, "summary") }),
  );
  if (failed) return failed;
  revalidatePath("/library", "layout");
  return { ok: "Saved." };
}

export async function publish(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await viewer("/library");
  const published = str(form, "published") === "yes";
  const failed = await attempt(() => setPublished(db, { starterId: str(form, "starter"), viewer: me, published }));
  if (failed) return failed;
  revalidatePath("/library", "layout");
  return { ok: published ? "It's in the library." : "It's off the library, and back on its maker's shelf." };
}

export async function remove(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await viewer("/library/mine");
  const failed = await attempt(() => deleteStarter(db, { starterId: str(form, "starter"), userId: me.id }));
  if (failed) return failed;
  revalidatePath("/library", "layout");
  redirect("/library/mine");
}

/** Add a starter to a gathering you host, then go to its setup. */
export async function addToGathering(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await viewer("/library");
  const gathering = await gatheringBySlug(db, str(form, "gathering"));
  if (!gathering) return { error: "Pick a gathering you host." };
  const failed = await attempt(() => addStarter(db, { gatheringId: gathering.id, starterId: str(form, "starter"), viewer: me }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  redirect(`/g/${gathering.slug}/setup?added=${encodeURIComponent(str(form, "starter"))}`);
}

/** Save a gathering's design to your shelf, new or over the one you saved before. */
export async function saveFromGathering(_prev: ActionState, form: FormData): Promise<ActionState> {
  const slug = str(form, "gathering");
  const me = await viewer(`/g/${slug}/starter`);
  const gathering = await gatheringBySlug(db, slug);
  if (!gathering) return { error: "That gathering isn't here." };
  const replace = str(form, "replace");
  let saved: Starter | undefined;
  const failed = await attempt(async () => {
    if (replace && !(await starterById(db, replace))) return;
    saved = await saveStarter(db, {
      gatheringId: gathering.id, userId: me.id, title: str(form, "title"), summary: str(form, "summary"),
      replaceId: replace || null,
    });
  });
  if (failed) return failed;
  if (!saved) return { error: "That starter isn't here any more. Save it as a new one." };
  revalidatePath("/library", "layout");
  redirect(`/library/${saved.slug}`);
}
