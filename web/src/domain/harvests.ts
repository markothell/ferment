// Harvests (PLAN §11; design/ferment/archive/harvests.html): a circle opens a
// closed round to its community.
//
//   anyone in the circle proposes ─→ gathering (a week)
//   gathering ─(a third yes)→ up ─(takeouts leave fewer than 3)→ down
//   gathering ─(the week ends short of 3)→ lapsed
//
// Supporting is consenting: only the answers of people who said yes are
// copied in. Silence is no. Choices can change until the week ends; taking
// yours out works any time after. Withdrawing is always individual. This is
// the only writer of harvests, harvest_choices and harvest_items.

import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import type { DB } from "@/db";
import {
  communities, harvestChoices, harvestItems, harvests, prompts, responseWords, responses, rounds, user, words,
} from "@/db/schema";
import { newId } from "@/lib/id";
import { displayName } from "@/lib/names";
import { isCircleMember } from "./circles";
import { refuse } from "./errors";
import { notifyCircle, notifyOne } from "./notifications";

export type Harvest = typeof harvests.$inferSelect;

export const HARVEST_MIN = 3;
export const HARVEST_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;
const REMIND_BEFORE_MS = 2 * DAY_MS;

export async function harvestById(db: DB, id: string): Promise<Harvest | null> {
  const [h] = await db.select().from(harvests).where(eq(harvests.id, id)).limit(1);
  return h ?? null;
}

const live = (h: Harvest, now: Date) => h.status !== "lapsed" && now < h.closesAt;

async function itemCount(db: DB, harvestId: string): Promise<number> {
  return (await db.select({ u: harvestItems.userId }).from(harvestItems).where(eq(harvestItems.harvestId, harvestId))).length;
}

/** Copy one person's answer into the harvest, as it stands now. */
async function copyIn(db: DB, h: Harvest, userId: string, now: Date): Promise<boolean> {
  const [r] = await db
    .select({ id: responses.id, text: responses.text, audioUrl: responses.audioUrl, audioSeconds: responses.audioSeconds,
      transcript: responses.transcript, transcriptStatus: responses.transcriptStatus, x: responses.x, y: responses.y,
      name: user.name, email: user.email })
    .from(responses)
    .innerJoin(user, eq(user.id, responses.userId))
    .where(and(eq(responses.roundId, h.roundId), eq(responses.userId, userId)))
    .limit(1);
  if (!r) return false;
  const chosen = await db
    .select({ label: words.label })
    .from(responseWords)
    .innerJoin(words, eq(words.id, responseWords.wordId))
    .where(and(eq(responseWords.responseId, r.id), eq(words.hidden, false)));
  const item = {
    name: displayName(r), text: r.text, audioUrl: r.audioUrl, audioSeconds: r.audioSeconds,
    transcript: r.transcriptStatus === "ready" ? r.transcript : null, x: r.x, y: r.y,
    words: chosen.map((w) => w.label),
  };
  await db
    .insert(harvestItems)
    .values({ harvestId: h.id, userId, ...item, sharedAt: now })
    .onConflictDoUpdate({ target: [harvestItems.harvestId, harvestItems.userId], set: item });
  return true;
}

/** Up at three, down below it once it has been up. Notifies on the change. */
async function settle(db: DB, h: Harvest, actorId: string | null, now: Date): Promise<Harvest> {
  const n = await itemCount(db, h.id);
  let next = h.status;
  if (n >= HARVEST_MIN && h.status !== "up" && (h.status === "gathering" || live(h, now))) next = "up";
  else if (n < HARVEST_MIN && h.status === "up") next = "down";
  if (next === h.status) return h;

  const [updated] = await db
    .update(harvests)
    .set(next === "up" ? { status: "up", upAt: h.upAt ?? now, downAt: null } : { status: next, downAt: now })
    .where(eq(harvests.id, h.id))
    .returning();
  const moment = { communityId: h.communityId, circleId: h.circleId, roundId: h.roundId, harvestId: h.id, actorId, now };
  if (next === "up") {
    await notifyCircle(db, h.circleId, { ...moment, kind: "harvest_up", actorId: null });
  } else if (next === "down") {
    const still = await db.select({ userId: harvestItems.userId }).from(harvestItems).where(eq(harvestItems.harvestId, h.id));
    for (const s of still) await notifyOne(db, s.userId, { ...moment, kind: "harvest_down" });
  }
  return updated;
}

/**
 * Anyone in the circle proposes opening a closed round. Their own answer, if
 * they gave one, goes in with the proposal. A harvest that lapsed or came down
 * can be proposed again; it starts fresh.
 */
export async function proposeHarvest(db: DB, { roundId, userId, now = new Date() }: { roundId: string; userId: string; now?: Date }): Promise<Harvest> {
  const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId)).limit(1);
  if (!round) refuse("That question doesn't exist.");
  if (!round.circleId) refuse("Open questions are already open to everyone.");
  if (round.phase !== "closed") refuse("A round can be opened once it has closed.");
  if (!(await isCircleMember(db, round.circleId, userId))) refuse("Only people in the circle can propose this.");

  const [existing] = await db.select().from(harvests).where(eq(harvests.roundId, roundId)).limit(1);
  if (existing && (existing.status === "gathering" || existing.status === "up")) refuse("This round has already been proposed.");

  const [prompt] = await db.select().from(prompts).where(eq(prompts.id, round.promptId)).limit(1);
  const answered = (await db.select({ id: responses.id }).from(responses).where(eq(responses.roundId, roundId))).length;
  if (answered < HARVEST_MIN) refuse(`It takes ${HARVEST_MIN} answers to open a round, and this one has ${answered}.`);

  const h = await db.transaction(async (tx) => {
    if (existing) await tx.delete(harvests).where(eq(harvests.id, existing.id));
    const [created] = await tx
      .insert(harvests)
      .values({
        id: newId(), communityId: round.communityId, circleId: round.circleId!, roundId, promptId: round.promptId,
        proposedBy: userId, question: prompt.question, shape: prompt.shape, axes: prompt.axes, answered,
        closesAt: new Date(now.getTime() + HARVEST_WINDOW_DAYS * DAY_MS), createdAt: now,
      })
      .returning();
    return created;
  });

  if (await copyIn(db, h, userId, now)) {
    await db.insert(harvestChoices).values({ harvestId: h.id, userId, share: true, at: now });
  }
  const answerers = await db.select({ userId: responses.userId }).from(responses).where(eq(responses.roundId, roundId));
  for (const a of answerers) {
    if (await isCircleMember(db, round.circleId, a.userId)) {
      await notifyOne(db, a.userId, { kind: "harvest_proposed", communityId: h.communityId, circleId: h.circleId, roundId, harvestId: h.id, actorId: userId, now });
    }
  }
  return settle(db, h, userId, now);
}

/**
 * Share mine, or keep mine in the circle. Either can change until the week
 * ends. Keeping yours after saying yes takes it out.
 */
export async function chooseHarvest(
  db: DB,
  { harvestId, userId, share, now = new Date() }: { harvestId: string; userId: string; share: boolean; now?: Date },
): Promise<Harvest> {
  const h = (await harvestById(db, harvestId)) ?? refuse("That harvest isn't here.");
  if (!share) return withdrawFromHarvest(db, { harvestId, userId, now, keep: true });
  if (!live(h, now)) refuse("The week for sharing has ended.");
  if (!(await isCircleMember(db, h.circleId, userId))) refuse("Only people in the circle can share into this.");
  if (!(await copyIn(db, h, userId, now))) refuse("You didn't answer this round, so there's nothing of yours to share.");
  await db
    .insert(harvestChoices)
    .values({ harvestId, userId, share: true, at: now })
    .onConflictDoUpdate({ target: [harvestChoices.harvestId, harvestChoices.userId], set: { share: true, at: now } });
  return settle(db, h, userId, now);
}

/** Take yours out: any time, and only ever your own. The original answer stays in the circle. */
export async function withdrawFromHarvest(
  db: DB,
  { harvestId, userId, now = new Date(), keep = false }: { harvestId: string; userId: string; now?: Date; keep?: boolean },
): Promise<Harvest> {
  const h = (await harvestById(db, harvestId)) ?? refuse("That harvest isn't here.");
  const answered = await db.select({ id: responses.id }).from(responses).where(and(eq(responses.roundId, h.roundId), eq(responses.userId, userId))).limit(1);
  const [item] = await db.select({ u: harvestItems.userId }).from(harvestItems).where(and(eq(harvestItems.harvestId, harvestId), eq(harvestItems.userId, userId))).limit(1);
  if (!item && !(keep && answered.length)) refuse("There's nothing of yours in this harvest.");
  await db.delete(harvestItems).where(and(eq(harvestItems.harvestId, harvestId), eq(harvestItems.userId, userId)));
  await db
    .insert(harvestChoices)
    .values({ harvestId, userId, share: false, at: now })
    .onConflictDoUpdate({ target: [harvestChoices.harvestId, harvestChoices.userId], set: { share: false, at: now } });
  return settle(db, h, userId, now);
}

/** Someone edited their answer after sharing it: the harvest shows the answer as it is now. */
export async function refreshHarvestItem(db: DB, { roundId, userId, now = new Date() }: { roundId: string; userId: string; now?: Date }) {
  const [h] = await db.select().from(harvests).where(eq(harvests.roundId, roundId)).limit(1);
  if (!h) return;
  const [item] = await db.select({ u: harvestItems.userId }).from(harvestItems).where(and(eq(harvestItems.harvestId, h.id), eq(harvestItems.userId, userId))).limit(1);
  if (item) await copyIn(db, h, userId, now);
}

/** The clock: a reminder two days before the week ends, then lapse whatever never reached three. */
export async function tickHarvests(db: DB, now = new Date()): Promise<{ reminded: number; lapsed: number }> {
  const soon = await db
    .select()
    .from(harvests)
    .where(and(inArray(harvests.status, ["gathering", "up"]), isNull(harvests.remindedAt), lte(harvests.closesAt, new Date(now.getTime() + REMIND_BEFORE_MS))));
  let reminded = 0;
  for (const h of soon) {
    if (h.closesAt <= now) continue;
    const [answerers, chose] = await Promise.all([
      db.select({ userId: responses.userId }).from(responses).where(eq(responses.roundId, h.roundId)),
      db.select({ userId: harvestChoices.userId }).from(harvestChoices).where(eq(harvestChoices.harvestId, h.id)),
    ]);
    const decided = new Set(chose.map((c) => c.userId));
    for (const a of answerers) {
      if (decided.has(a.userId) || !(await isCircleMember(db, h.circleId, a.userId))) continue;
      await notifyOne(db, a.userId, { kind: "harvest_reminder", communityId: h.communityId, circleId: h.circleId, roundId: h.roundId, harvestId: h.id, now });
      reminded++;
    }
    await db.update(harvests).set({ remindedAt: now }).where(eq(harvests.id, h.id));
  }

  const ended = await db.select().from(harvests).where(and(eq(harvests.status, "gathering"), lte(harvests.closesAt, now)));
  for (const h of ended) {
    await db.update(harvests).set({ status: "lapsed" }).where(eq(harvests.id, h.id));
    if (h.proposedBy) await notifyOne(db, h.proposedBy, { kind: "harvest_lapsed", communityId: h.communityId, circleId: h.circleId, roundId: h.roundId, harvestId: h.id, now });
  }
  return { reminded, lapsed: ended.length };
}

/** What the round page shows someone in the circle: the harvest's state and their own part in it. */
export async function harvestForRound(db: DB, roundId: string, viewerId: string, now = new Date()) {
  const [h] = await db.select().from(harvests).where(eq(harvests.roundId, roundId)).limit(1);
  if (!h) return null;
  const [[community], items, choice, proposer] = await Promise.all([
    db.select({ name: communities.name }).from(communities).where(eq(communities.id, h.communityId)).limit(1),
    db.select({ userId: harvestItems.userId }).from(harvestItems).where(eq(harvestItems.harvestId, h.id)),
    db.select({ share: harvestChoices.share }).from(harvestChoices).where(and(eq(harvestChoices.harvestId, h.id), eq(harvestChoices.userId, viewerId))).limit(1),
    h.proposedBy ? db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, h.proposedBy)).limit(1) : [],
  ]);
  return {
    harvest: h,
    communityName: community.name,
    shared: items.length,
    open: live(h, now),
    mineIn: items.some((i) => i.userId === viewerId),
    myChoice: choice[0] ? (choice[0].share ? "share" : "keep") : null,
    proposer: proposer[0] ? (h.proposedBy === viewerId ? "You" : displayName(proposer[0])) : "Someone",
  } as const;
}
