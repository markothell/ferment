"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { user } from "@/db/schema";
import type { ActionState } from "@/lib/actions";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";

export async function setName(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireUser();
  const name = String(form.get("name") || "").trim().replace(/\s+/g, " ");
  if (!name) return { error: "What should people call you?" };
  if (name.length > 60) return { error: "That's a long name. 60 characters at most." };
  await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, me.id));
  revalidatePath("/home");
  return { ok: "Saved." };
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/signin");
}

