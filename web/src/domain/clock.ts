// The clock (PLAN §7): the only work that happens because time passed.
// Rounds whose timer ran out close, unfilled proposals lapse, invitations and
// seat requests nobody decided in 14 days lapse, harvests get their reminder
// and lapse at the end of their week, waiting notifications go out
// by email, and recordings still without a transcript
// get one. Idempotent; run every 15 minutes. Takes the database, the mail
// sender and the transcriber so tests can pass their own.

import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import type { DB } from "@/db";
import { gatherings, rounds } from "@/db/schema";
import type { Mail } from "@/lib/email";
import { appUrl } from "@/lib/urls";
import { expireProposals } from "./circles";
import { tickHarvests } from "./harvests";
import { lapseInvites } from "./invites";
import { dueEmails, listNotifications, markEmailed } from "./notifications";
import { settleCircle } from "./rounds";
import { lapseSeats } from "./seats";
import { transcribePending, type Transcriber } from "./transcripts";

export async function runClock(db: DB, send: (mail: Mail) => Promise<void>, now = new Date(), transcribe: Transcriber | null = null) {
  const expired = await expireProposals(db, now);

  const due = await db
    .selectDistinct({ circleId: rounds.circleId })
    .from(rounds)
    .where(and(eq(rounds.phase, "open"), isNotNull(rounds.circleId), lte(rounds.closesAt, now)));
  for (const { circleId } of due) await settleCircle(db, circleId!, now);

  await db
    .update(rounds)
    .set({ phase: "closed", closedAt: now, closedVia: "timer" })
    .where(and(eq(rounds.phase, "open"), isNull(rounds.circleId), lte(rounds.closesAt, now)));

  const harvested = await tickHarvests(db, now);
  const lapsed = (await lapseInvites(db, now)) + (await lapseSeats(db, now)) + harvested.lapsed;
  const sent = await deliver(db, send, now);
  const transcribed = transcribe ? await transcribePending(db, transcribe, now) : 0;
  return { expired: expired.length, settled: due.length, lapsed, emails: sent, transcribed };
}

async function deliver(db: DB, send: (mail: Mail) => Promise<void>, now: Date): Promise<number> {
  const batches = await dueEmails(db, now);
  let sent = 0;
  for (const b of batches) {
    try {
      const items = await listNotifications(db, { userId: b.userId, ids: b.ids });
      if (!items.length) continue;
      const [gathering] = await db.select({ name: gatherings.name, slug: gatherings.slug }).from(gatherings).where(eq(gatherings.id, b.gatheringId)).limit(1);
      const subject = b.pref === "digest"
        ? `Today in ${gathering.name}`
        : items.length === 1 ? items[0].text.replace(/\.$/, "") : `${items.length} new in ${gathering.name}`;
      const lines = items.map((n) => `• ${n.text}\n  ${appUrl(n.href)}`);
      await send({
        to: b.email,
        subject,
        text: [
          `In ${gathering.name}:`,
          "",
          ...lines,
          "",
          `Choose how often you hear from ${gathering.name}: ${appUrl(`/g/${gathering.slug}/settings`)}`,
        ].join("\n"),
      });
      await markEmailed(db, b.ids, now);
      sent++;
    } catch (e) {
      console.error(`[tick] mail to ${b.email} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}
