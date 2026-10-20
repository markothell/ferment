// Gatherings: the social home and the outermost circle (PLAN §1, §4).

import { and, asc, count, eq, gt, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import type { DB } from "@/db";
import { circleMembers, circles, gatherings, gatheringMembers, prompts, responses, rounds, user } from "@/db/schema";
import { newId } from "@/lib/id";
import { refuse } from "./errors";
import { normalizePrompt } from "./prompts";
import { uniqueSlug } from "./slug";

export const NAME_MAX = 60;
export const NOTE_MAX = 2000;
const DAY_MS = 86_400_000;

export type Gathering = typeof gatherings.$inferSelect;
export type Membership = typeof gatheringMembers.$inferSelect;

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) refuse("Give it a name.");
  if (name.length > NAME_MAX) refuse(`Names are ${NAME_MAX} characters at most.`);
  return name;
}

/** How many gatherings one person can start in a day: open to anyone, so capped. */
export const STARTS_PER_DAY = 5;

export async function createGathering(
  db: DB,
  {
    userId, name, welcomeNote = "", starterId = null, seed, now = new Date(),
  }: {
    userId: string; name: string; welcomeNote?: string; now?: Date;
    /** Started from a starter: its id, and what fills the gathering in the same transaction (domain/starters.ts). */
    starterId?: string | null;
    seed?: (tx: DB, gathering: Gathering) => Promise<void>;
  },
): Promise<Gathering> {
  const clean = cleanName(name);
  const note = welcomeNote.trim();
  if (note.length > NOTE_MAX) refuse("That welcome note is too long.");
  const [{ started }] = await db
    .select({ started: count() })
    .from(gatherings)
    .where(and(eq(gatherings.createdBy, userId), gt(gatherings.createdAt, new Date(now.getTime() - DAY_MS))));
  if (started >= STARTS_PER_DAY) refuse(`That's ${STARTS_PER_DAY} gatherings started today. Try again tomorrow.`);

  const slug = await uniqueSlug(clean, async (s) =>
    Boolean((await db.select({ id: gatherings.id }).from(gatherings).where(eq(gatherings.slug, s)).limit(1))[0]),
  );

  return db.transaction(async (tx) => {
    const [gathering] = await tx
      .insert(gatherings)
      .values({ id: newId(), slug, name: clean, welcomeNote: note, createdBy: userId, createdAt: now, starterId })
      .returning();
    await tx.insert(gatheringMembers).values({ gatheringId: gathering.id, userId, role: "host", joinedAt: now });
    if (seed) await seed(tx as unknown as DB, gathering);
    return gathering;
  });
}

export async function gatheringBySlug(db: DB, slug: string): Promise<Gathering | null> {
  const [c] = await db.select().from(gatherings).where(eq(gatherings.slug, slug)).limit(1);
  return c ?? null;
}

export async function membershipOf(db: DB, gatheringId: string, userId: string): Promise<Membership | null> {
  const [m] = await db
    .select()
    .from(gatheringMembers)
    .where(and(eq(gatheringMembers.gatheringId, gatheringId), eq(gatheringMembers.userId, userId)))
    .limit(1);
  return m ?? null;
}

export async function requireMember(db: DB, gatheringId: string, userId: string): Promise<Membership> {
  return (await membershipOf(db, gatheringId, userId)) ?? refuse("You're not a member of this gathering.");
}

export async function requireHost(db: DB, gatheringId: string, userId: string): Promise<Membership> {
  const m = await requireMember(db, gatheringId, userId);
  if (m.role !== "host") refuse("Only a host can do that.");
  return m;
}

export async function memberCount(db: DB, gatheringId: string): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(gatheringMembers).where(eq(gatheringMembers.gatheringId, gatheringId));
  return n;
}

/** Your gatherings, without the ones you've archived. */
export async function listMyGatherings(db: DB, userId: string) {
  return db
    .select({ id: gatherings.id, slug: gatherings.slug, name: gatherings.name, role: gatheringMembers.role })
    .from(gatheringMembers)
    .innerJoin(gatherings, eq(gatherings.id, gatheringMembers.gatheringId))
    .where(and(eq(gatheringMembers.userId, userId), isNull(gatheringMembers.archivedAt)))
    .orderBy(asc(gatherings.name));
}

/** The ones you've archived, so you can bring them back. */
export async function listMyArchived(db: DB, userId: string) {
  return db
    .select({ id: gatherings.id, slug: gatherings.slug, name: gatherings.name })
    .from(gatheringMembers)
    .innerJoin(gatherings, eq(gatherings.id, gatheringMembers.gatheringId))
    .where(and(eq(gatheringMembers.userId, userId), isNotNull(gatheringMembers.archivedAt)))
    .orderBy(asc(gatherings.name));
}

/**
 * Move a gathering off your own list, or back onto it. It's yours alone: the
 * gathering, its members and its pages are untouched, and you can still open it.
 */
export async function setArchived(
  db: DB,
  { gatheringId, userId, archived, now = new Date() }: { gatheringId: string; userId: string; archived: boolean; now?: Date },
): Promise<void> {
  await requireMember(db, gatheringId, userId);
  await db
    .update(gatheringMembers)
    .set({ archivedAt: archived ? now : null })
    .where(and(eq(gatheringMembers.gatheringId, gatheringId), eq(gatheringMembers.userId, userId)));
}

export async function updateWelcomeNote(
  db: DB,
  { gatheringId, userId, note }: { gatheringId: string; userId: string; note: string },
): Promise<void> {
  await requireHost(db, gatheringId, userId);
  const clean = note.trim();
  if (clean.length > NOTE_MAX) refuse("That welcome note is too long.");
  await db.update(gatherings).set({ welcomeNote: clean }).where(eq(gatherings.id, gatheringId));
}

/**
 * The welcome question: an open question every newcomer is invited to answer
 * (PLAN §4). A story, voice first, on an open wall, and it never closes.
 * Rewording it is free until someone has answered; after that a new question
 * replaces it and the old one closes with its answers intact.
 */
export async function setWelcomeQuestion(
  db: DB,
  { gatheringId, userId, question, now = new Date() }: { gatheringId: string; userId: string; question: string; now?: Date },
): Promise<void> {
  await requireHost(db, gatheringId, userId);
  const prompt = normalizePrompt({ question, shape: "story", telling: "voice", reveal: "open" });
  const q = prompt.question;

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ roundId: rounds.id, promptId: rounds.promptId })
      .from(rounds)
      .where(and(eq(rounds.gatheringId, gatheringId), eq(rounds.welcome, true)))
      .limit(1);

    if (current) {
      const [{ n }] = await tx.select({ n: count() }).from(responses).where(eq(responses.roundId, current.roundId));
      if (n === 0) {
        await tx.update(prompts).set({ question: q }).where(eq(prompts.id, current.promptId));
        return;
      }
      await tx
        .update(rounds)
        .set({ welcome: false, phase: "closed", closedAt: now, closedVia: "manual" })
        .where(eq(rounds.id, current.roundId));
    }

    const promptId = newId();
    await tx.insert(prompts).values({ id: promptId, gatheringId, authorId: userId, ...prompt });
    await tx.insert(rounds).values({
      id: newId(), promptId, gatheringId, authorId: userId,
      welcome: true, phase: "open", openedAt: now, editAfterClose: true,
    });
  });
}

/** Everything the gathering page shows, for a member. */
export async function gatheringHome(db: DB, gathering: Gathering, viewerId: string) {
  const [members, welcome, circleRows, mine] = await Promise.all([
    db
      .select({ userId: user.id, name: user.name, email: user.email, role: gatheringMembers.role, joinedAt: gatheringMembers.joinedAt })
      .from(gatheringMembers)
      .innerJoin(user, eq(user.id, gatheringMembers.userId))
      .where(eq(gatheringMembers.gatheringId, gathering.id))
      .orderBy(asc(gatheringMembers.joinedAt)),
    db
      .select({ roundId: rounds.id, question: prompts.question })
      .from(rounds)
      .innerJoin(prompts, eq(prompts.id, rounds.promptId))
      .where(and(eq(rounds.gatheringId, gathering.id), eq(rounds.welcome, true)))
      .limit(1),
    db
      .select({
        id: circles.id, slug: circles.slug, name: circles.name, description: circles.description,
        status: circles.status, color: circles.color, hostId: circles.hostId, formingExpiresAt: circles.formingExpiresAt,
        members: count(circleMembers.userId),
      })
      .from(circles)
      .leftJoin(circleMembers, and(eq(circleMembers.circleId, circles.id), isNull(circleMembers.leftAt)))
      .where(and(eq(circles.gatheringId, gathering.id), notInArray(circles.status, ["closed", "expired"])))
      .groupBy(circles.id)
      .orderBy(asc(circles.createdAt)),
    db
      .select({ circleId: circleMembers.circleId })
      .from(circleMembers)
      .innerJoin(circles, eq(circles.id, circleMembers.circleId))
      .where(and(eq(circleMembers.userId, viewerId), isNull(circleMembers.leftAt), eq(circles.gatheringId, gathering.id))),
  ]);

  const myCircleIds = new Set(mine.map((m) => m.circleId));
  return {
    members,
    welcome: welcome[0] ?? null,
    circles: circleRows.map((c) => ({ ...c, isMember: myCircleIds.has(c.id) })),
  };
}

/** What the gathering map draws: circles with their members, what they've explored, what's open. */
export async function gatheringMapData(db: DB, gatheringId: string) {
  const [circleRows, memberRows, roundRows, answerRows] = await Promise.all([
    db
      .select({ id: circles.id, slug: circles.slug, name: circles.name, status: circles.status, color: circles.color })
      .from(circles)
      .where(and(eq(circles.gatheringId, gatheringId), notInArray(circles.status, ["closed", "expired"])))
      .orderBy(asc(circles.createdAt)),
    db
      .select({ circleId: circleMembers.circleId, userId: circleMembers.userId })
      .from(circleMembers)
      .innerJoin(circles, eq(circles.id, circleMembers.circleId))
      .where(and(eq(circles.gatheringId, gatheringId), isNull(circleMembers.leftAt)))
      .orderBy(asc(circleMembers.joinedAt)),
    db
      .select({ circleId: rounds.circleId, phase: rounds.phase, n: count() })
      .from(rounds)
      .where(and(eq(rounds.gatheringId, gatheringId), inArray(rounds.phase, ["open", "closed"])))
      .groupBy(rounds.circleId, rounds.phase),
    db
      .selectDistinct({ userId: responses.userId })
      .from(responses)
      .innerJoin(rounds, eq(rounds.id, responses.roundId))
      .where(and(eq(rounds.gatheringId, gatheringId), isNull(rounds.circleId), eq(rounds.phase, "open"))),
  ]);

  const tally = (circleId: string | null, phase: "open" | "closed") =>
    roundRows.find((r) => r.circleId === circleId && r.phase === phase)?.n ?? 0;

  return {
    circles: circleRows.map((c) => ({
      id: c.id, slug: c.slug, name: c.name, color: c.color, forming: c.status === "forming",
      members: memberRows.filter((m) => m.circleId === c.id).map((m) => m.userId),
      explored: tally(c.id, "closed"), open: tally(c.id, "open"),
    })),
    openQuestions: tally(null, "open"),
    answerers: answerRows.map((r) => r.userId),
  };
}
