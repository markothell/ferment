import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { headers } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { maySignIn, normalizeEmail } from "./access";
import { sendMail } from "./email";

// Inside heldLink(), a sign-in link is handed back to the caller instead of
// emailed. Scoped to that one call: a request to the public endpoint never
// runs inside it, so its links always go by email.
const held = new AsyncLocalStorage<{ url?: string }>();

// A held link's token starts with this. It can't be added to an emailed
// token or taken off a held one: the stored verification is keyed on the
// whole token. So a sign-in always knows which kind of link it came from.
const HELD = "held_";

/** The link a sign-in came from: held (heldLink), emailed, or not a link at all. */
function linkKind(ctx: { path?: string; query?: Record<string, unknown> } | null): "held" | "emailed" | null {
  if (ctx?.path !== "/magic-link/verify") return null;
  return String(ctx.query?.token ?? "").startsWith(HELD) ? "held" : "emailed";
}

// The rule for held links, checked as they are used, not only when made: a
// held link may open a new account, flagged openedByInvite, and only ever an
// account still so flagged. The first emailed link into a flagged account is
// its owner, reading their own mail: that clears the flag and ends every other
// session, so whoever opened a forwarded invitation is out and can't come back
// with a held link made earlier.
const linkRules = {
  user: {
    create: {
      async after(user: { id: string }, ctx: Parameters<typeof linkKind>[0]) {
        if (linkKind(ctx) === "held") await db.update(schema.user).set({ openedByInvite: true }).where(eq(schema.user.id, user.id));
      },
    },
  },
  session: {
    create: {
      async before(session: { userId: string }, ctx: Parameters<typeof linkKind>[0]) {
        if (linkKind(ctx) !== "held") return;
        const [u] = await db.select({ flagged: schema.user.openedByInvite }).from(schema.user).where(eq(schema.user.id, session.userId)).limit(1);
        if (!u?.flagged) return false;
      },
      async after(session: { id: string; userId: string }, ctx: Parameters<typeof linkKind>[0]) {
        if (linkKind(ctx) === "held") {
          // Claimed between the check above and this session's insert: the
          // claim's sweep may have run first and missed it, so sweep it here.
          const [u] = await db.select({ flagged: schema.user.openedByInvite }).from(schema.user).where(eq(schema.user.id, session.userId)).limit(1);
          if (!u?.flagged) await db.delete(schema.session).where(eq(schema.session.id, session.id));
          return;
        }
        if (linkKind(ctx) !== "emailed") return;
        const [claimed] = await db
          .update(schema.user)
          .set({ openedByInvite: false })
          .where(and(eq(schema.user.id, session.userId), eq(schema.user.openedByInvite, true)))
          .returning({ id: schema.user.id });
        if (claimed) {
          await db.delete(schema.session).where(and(eq(schema.session.userId, session.userId), ne(schema.session.id, session.id)));
        }
      },
    },
  },
};

// Email-link sign-in only; no passwords (PLAN §9).
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  session: {
    expiresIn: 60 * 60 * 24 * 60, // 60 days: people come back by email, weeks apart
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: linkRules,
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      storeToken: "hashed",
      generateToken: () => (held.getStore() ? HELD : "") + randomBytes(24).toString("base64url"),
      async sendMagicLink({ email, url }) {
        // A held link sends no mail, so it isn't counted (lib/access.ts).
        const hold = held.getStore();
        if (hold) {
          hold.url = url;
          return;
        }
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

/**
 * A sign-in link made and handed back rather than emailed, for someone who
 * has already shown they read mail at the address: they opened an invitation
 * sent to it. Only ever for a new account: a forwarded invitation must not
 * open an existing one, with everything it already belongs to, so those still
 * get their link by email. Null when the address has an account.
 */
export async function heldLink(body: { email: string; name?: string; callbackURL: string; errorCallbackURL: string }): Promise<string | null> {
  const [existing] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, normalizeEmail(body.email))).limit(1);
  if (existing) return null;
  const hold: { url?: string } = {};
  await held.run(hold, async () => auth.api.signInMagicLink({ body, headers: await headers() }));
  return hold.url ?? null;
}

export async function currentSession() {
  return auth.api.getSession({ headers: await headers() });
}
