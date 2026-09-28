import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import { maySignIn } from "./access";
import { sendMail } from "./email";

// Email-link sign-in only; no passwords (PLAN §9).
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  session: {
    expiresIn: 60 * 60 * 24 * 60, // 60 days: people come back by email, weeks apart
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      storeToken: "hashed",
      async sendMagicLink({ email, url }) {
        if (!(await maySignIn(db, email))) return;
        await sendMail({
          to: email,
          subject: "Your sign-in link for ferment",
          text: `Open this link to sign in. It works once, for 15 minutes.\n\n${url}\n\nIf you didn't ask for it, you can ignore this email.`,
        });
      },
    }),
    nextCookies(), // must stay last
  ],
});

export async function currentSession() {
  return auth.api.getSession({ headers: await headers() });
}
