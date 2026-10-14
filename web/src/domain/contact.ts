// The way someone reaches the person who runs ferment: /contact, linked from
// account settings and the homepage. Two things matter most:
//   1. The message is saved before it's emailed. A send can fail for reasons
//      the writer can't see or fix; a row can't.
//   2. What the writer types never reaches a header unchecked. Their address
//      becomes the reply-to only after it passes validation.

import { and, count, eq, gt, isNull, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { contactMessages } from "@/db/schema";
import { hostAllowlist, normalizeEmail } from "@/lib/access";
import { newId } from "@/lib/id";
import { refuse } from "./errors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
const NAME_MAX = 80;
export const MESSAGE_MAX = 5000;
// Open to anyone and it sends an email, so it's capped per address. Generous
// enough that writing twice because you forgot something is never blocked.
const PER_HOUR = 5;
// Signed out, the address is whatever the writer typed, so a bot changing it
// each time never meets PER_HOUR. This caps all signed-out messages together.
// Members are never held by it.
export const SIGNED_OUT_PER_HOUR = 20;
// The row that says the signed-out cap tripped and you were told, at most once an hour.
const CAP_ALERT = "cap-alert";

/** Who reads these: FERMENT_CONTACT_EMAIL, else the first host on the allowlist. */
export function contactInbox(env: Record<string, string | undefined> = process.env): string | null {
  const set = env.FERMENT_CONTACT_EMAIL?.trim();
  if (set) return set;
  const [first] = hostAllowlist(env.FERMENT_HOST_EMAILS);
  return first ?? null;
}

export type ContactMail = { to: string; replyTo?: string; subject: string; text: string };

export async function sendContact(
  db: DB,
  { userId, name, email, message, now = new Date() }: { userId?: string; name: string; email: string; message: string; now?: Date },
  send: (mail: ContactMail) => Promise<void>,
  inbox = contactInbox(),
): Promise<{ id: string; delivery: string }> {
  const cleanEmail = normalizeEmail(email);
  if (cleanEmail.length > EMAIL_MAX || !EMAIL_RE.test(cleanEmail)) refuse("An email address we can write back to, please.");
  const cleanMessage = message.trim();
  if (!cleanMessage) refuse("What would you like to say?");
  if (cleanMessage.length > MESSAGE_MAX) refuse(`Please keep it under ${MESSAGE_MAX.toLocaleString("en")} characters.`);
  const cleanName = name.trim().replace(/\s+/g, " ").slice(0, NAME_MAX);

  const hourAgo = new Date(now.getTime() - 3_600_000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(contactMessages)
    .where(and(eq(contactMessages.email, cleanEmail), gt(contactMessages.createdAt, hourAgo)));
  if (n >= PER_HOUR) refuse("That's a few messages in an hour. Try again a little later.");
  if (!userId) await capSignedOut(db, { email: cleanEmail, message: cleanMessage, hourAgo, now }, send, inbox);

  // Saved first, deliberately (see the top of this file).
  const id = newId();
  await db.insert(contactMessages).values({ id, userId: userId ?? null, name: cleanName, email: cleanEmail, message: cleanMessage, createdAt: now });

  let delivery = "sent";
  if (!inbox) delivery = "no-inbox";
  else {
    try {
      await send({
        to: inbox,
        // Hitting reply answers the person who wrote in.
        replyTo: cleanEmail,
        subject: `ferment contact: ${cleanName || cleanEmail}`,
        text: [
          `${cleanName || "(no name given)"} <${cleanEmail}>${userId ? "" : " (not signed in)"} wrote:`,
          "",
          cleanMessage,
          "",
          `Saved as contact message ${id}.`,
        ].join("\n"),
      });
    } catch (e) {
      delivery = "failed";
      console.warn(`[contact] message ${id} from ${cleanEmail} not delivered:`, e);
    }
  }
  await db.update(contactMessages).set({ delivery }).where(eq(contactMessages.id, id));
  // Success reports the save, which is what happened. The writer can't act on a failed send.
  return { id, delivery };
}

/** Refuses a signed-out message past SIGNED_OUT_PER_HOUR, and tells you the first time in an hour. */
async function capSignedOut(
  db: DB,
  { email, message, hourAgo, now }: { email: string; message: string; hourAgo: Date; now: Date },
  send: (mail: ContactMail) => Promise<void>,
  inbox: string | null,
) {
  const recent = and(isNull(contactMessages.userId), gt(contactMessages.createdAt, hourAgo));
  const [{ n }] = await db.select({ n: count() }).from(contactMessages).where(and(recent, ne(contactMessages.delivery, CAP_ALERT)));
  if (n < SIGNED_OUT_PER_HOUR) return;

  const [{ told }] = await db.select({ told: count() }).from(contactMessages).where(and(recent, eq(contactMessages.delivery, CAP_ALERT)));
  if (!told) {
    const id = newId();
    const text = [
      `${n} messages came in from signed-out visitors in the last hour, so /contact is turning signed-out messages away until the hour rolls over. Members can still write.`,
      "",
      "The first one turned away:",
      `${email} wrote:`,
      "",
      message.slice(0, 1000),
      "",
      `The hour's messages are in contact_messages (signed-out rows have no user_id). This note is saved as ${id}; you'll get at most one an hour.`,
    ].join("\n");
    // Saved first, like a message, so the once-an-hour holds even if the send fails.
    await db.insert(contactMessages).values({ id, name: "", email: "", message: text, delivery: CAP_ALERT, createdAt: now });
    console.warn(`[contact] signed-out cap reached: ${n} in the last hour`);
    if (inbox) {
      try {
        await send({ to: inbox, subject: "ferment contact: signed-out messages capped", text });
      } catch (e) {
        console.warn(`[contact] cap alert ${id} not delivered:`, e);
      }
    }
  }
  refuse("A lot of messages are coming in just now. Try again in an hour, or sign in to write.");
}
