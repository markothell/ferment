"use server";

import { db } from "@/db";
import { sendContact } from "@/domain/contact";
import { Refusal } from "@/domain/errors";
import type { ActionState } from "@/lib/actions";
import { currentSession } from "@/lib/auth";
import { sendMail } from "@/lib/email";

export async function contact(_prev: ActionState, form: FormData): Promise<ActionState> {
  // Filled only by bots: the field is hidden from people. Looks sent, goes nowhere.
  if (String(form.get("website") || "")) return { ok: "sent" };
  // Signed in, the account says who's writing; the form only asks when you're not.
  const session = await currentSession();
  try {
    await sendContact(
      db,
      {
        userId: session?.user.id,
        name: session ? session.user.name : String(form.get("name") || ""),
        email: session ? session.user.email : String(form.get("email") || ""),
        message: String(form.get("message") || ""),
      },
      sendMail,
    );
  } catch (e) {
    if (e instanceof Refusal) return { error: e.message };
    throw e;
  }
  return { ok: "sent" };
}
