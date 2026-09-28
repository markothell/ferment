import "server-only";

import { Resend } from "resend";

export type Mail = { to: string; subject: string; text: string; html?: string };

// RESEND_API_KEY unset → mail is printed to the dev server console instead of
// sent, so sign-in links and invitations work locally with no account.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const from = process.env.EMAIL_FROM || "ferment <hello@ferment.earth>";

export async function sendMail(mail: Mail): Promise<void> {
  if (!resend) {
    console.log(`\n✉️  to ${mail.to} — ${mail.subject}\n${mail.text}\n`);
    return;
  }
  const { error } = await resend.emails.send({ from, ...mail });
  if (error) throw new Error(`Mail to ${mail.to} failed: ${error.message}`);
}
