"use server";

import { headers } from "next/headers";
import * as z from "zod";
import { auth } from "@/lib/auth";
import { normalizeEmail } from "@/lib/access";

export type SignInState = { sentTo?: string; error?: string } | undefined;

const Email = z.email();

export async function requestLink(_prev: SignInState, form: FormData): Promise<SignInState> {
  const parsed = Email.safeParse(String(form.get("email") || "").trim());
  if (!parsed.success) return { error: "That doesn't look like an email address." };
  const email = normalizeEmail(parsed.data);

  // Same answer whether or not a link was sent (src/lib/access.ts).
  await auth.api.signInMagicLink({
    body: { email, callbackURL: "/home", errorCallbackURL: "/signin?error=link" },
    headers: await headers(),
  });
  return { sentTo: email };
}
