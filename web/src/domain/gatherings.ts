// Gatherings: a group of kind "gathering", the social home and the outermost
// circle (PLAN §1, §4; GROUPS.md). A gathering is a root group; its circles
// are the groups under it. The functions here keep their old names, so the
// pages and tests read as before.

import { and, asc, count, eq, gt, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import type { DB } from "@/db";
import { groups, members, prompts, responses, rounds, user } from "@/db/schema";
import { newId } from "@/lib/id";
import { refuse } from "./errors";
import { normalizePrompt } from "./prompts";
import { uniqueSlug } from "./slug";

export const NAME_MAX = 60;
export const NOTE_MAX = 2000;
const DAY_MS = 86_400_000;

export type Group = typeof groups.$inferSelect;
export type Gathering = Group;
export type Membership = typeof members.$inferSelect;

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) refuse("Give it a name.");
  if (name.length > NAME_MAX) refuse(`Names are ${NAME_MAX} characters at most.`);
  return name;
}

/** How many gatherings one person can start in a day: open to anyone, so capped. */
export const STARTS_PER_DAY = 5;

/** Is this slug taken by any group? Slugs are unique across the site (GROUPS.md §2). */
export async function slugTaken(db: DB, slug: string): Promise<boolean> {
  return Boolean((await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, slug)).limit(1))[0]);
}

export async function groupById(db: DB, id: string): Promise<Group | null> {
  const [g] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  return g ?? null;
}

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
    .from(groups)
    .where(and(eq(groups.createdBy, userId), isNull(groups.parentId), gt(groups.createdAt, new Date(now.getTime() - DAY_MS))));
  if (started >= STARTS_PER_DAY) refuse(`That's ${STARTS_PER_DAY} gatherings started today. Try again tomorrow.`);

  const slug = await uniqueSlug(clean, (s) => slugTaken(db, s));
  const id = newId();

  return db.transaction(async (tx) => {
    const [gathering] = await tx
      .insert(groups)
      .values({ id, slug, kind: "gathering", parentId: null, rootId: id, name: clean, note, createdBy: userId, createdAt: now, starterId })
      .returning();
    await tx.insert(members).values({ groupId: gathering.id, userId, role: "host", joinedAt: now });
    if (seed) await seed(tx as unknown as DB, gathering);
    return gathering;
  });
}

/** A root group by its address: a gathering, or (later) a circle on its own. */
export async function gatheringBySlug(db: DB, slug: string): Promise<Gathering | null> {
  const [g] = await db.select().from(groups).where(and(eq(groups.slug, slug), isNull(groups.parentId))).limit(1);
  return g ?? null;
}

/** Someone's place in a group, if they're in it and haven't left. */
export async function membershipOf(db: DB, groupId: string, userId: string): Promise<Membership | null> {
  const [m] = await db
    .select()
    .from(members)
    .where(and(eq(members.groupId, groupId), eq(members.userId, userId), isNull(members.leftAt)))
    .limit(1);
  return m ?? null;
}

export async function requireMember(db: DB, groupId: string, userId: string): Promise<Membership> {
  return (await membershipOf(db, groupId, userId)) ?? refuse("You're not a member of this gathering.");
}

export async function requireHost(db: DB, groupId: string, userId: string): Promise<Membership> {
  const m = await requireMember(db, groupId, userId);
  if (m.role !== "host") refuse("Only a host can do that.");
  return m;
}

export async function memberCount(db: DB, groupId: string): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(members).where(and(eq(members.groupId, groupId), isNull(members.leftAt)));
  return n;
}

/** Your gatherings (the root groups you're in), without the ones you've archived. */
export async function listMyGatherings(db: DB, userId: string) {
  return db
    .select({ id: groups.id, slug: groups.slug, name: groups.name, kind: groups.kind, role: members.role })
    .from(members)
    .innerJoin(groups, eq(groups.id, members.groupId))
    .where(and(eq(members.userId, userId), isNull(groups.parentId), isNull(members.leftAt), isNull(members.archivedAt)))
    .orderBy(asc(groups.name));
}

/** The ones you've archived, so you can bring them back. */
export async function listMyArchived(db: DB, userId: string) {
  return db
    .select({ id: groups.id, slug: groups.slug, name: groups.name, kind: groups.kind })
    .from(members)
    .innerJoin(groups, eq(groups.id, members.groupId))
    .where(and(eq(members.userId, userId), isNull(groups.parentId), isNull(members.leftAt), isNotNull(members.archivedAt)))
    .orderBy(asc(groups.name));
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
    .update(members)
    .set({ archivedAt: archived ? now : null })
    .where(and(eq(members.groupId, gatheringId), eq(members.userId, userId)));
}

export async function updateWelcomeNote(
  db: DB,
  { gatheringId, userId, note }: { gatheringId: string; userId: string; note: string },
): Promise<void> {
  await requireHost(db, gatheringId, userId);
  const clean = note.trim();
  if (clean.length > NOTE_MAX) refuse("That welcome note is too long.");
  await db.update(groups).set({ note: clean }).where(eq(groups.id, gatheringId));
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
      .where(and(eq(rounds.rootId, gatheringId), eq(rounds.welcome, true)))
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
    await tx.insert(prompts).values({ id: promptId, rootId: gatheringId, authorId: userId, ...prompt });
    await tx.insert(rounds).values({
      id: newId(), promptId, groupId: gatheringId, rootId: gatheringId, authorId: userId,
      welcome: true, phase: "open", openedAt: now, editAfterClose: true,
    });
  });
}

/** The circles a gathering holds, as its pages list them. */
const circleColumns = {
  id: groups.id, slug: groups.slug, name: groups.name, description: groups.note,
  status: groups.status, color: groups.color, hostId: groups.hostId, formingExpiresAt: groups.formingExpiresAt,
};

/** Everything the gathering page shows, for a member. */
export async function gatheringHome(db: DB, gathering: Gathering, viewerId: string) {
  const [memberRows, welcome, circleRows, mine] = await Promise.all([
    db
      .select({ userId: user.id, name: user.name, email: user.email, role: members.role, joinedAt: members.joinedAt })
      .from(members)
      .innerJoin(user, eq(user.id, members.userId))
      .where(and(eq(members.groupId, gathering.id), isNull(members.leftAt)))
      .orderBy(asc(members.joinedAt)),
    db
      .select({ roundId: rounds.id, question: prompts.question })
      .from(rounds)
      .innerJoin(prompts, eq(prompts.id, rounds.promptId))
      .where(and(eq(rounds.rootId, gathering.id), eq(rounds.welcome, true)))
      .limit(1),
    db
      .select({ ...circleColumns, members: count(members.userId) })
      .from(groups)
      .leftJoin(members, and(eq(members.groupId, groups.id), isNull(members.leftAt)))
      .where(and(eq(groups.parentId, gathering.id), notInArray(groups.status, ["closed", "expired"])))
      .groupBy(groups.id)
      .orderBy(asc(groups.createdAt)),
    db
      .select({ circleId: members.groupId })
      .from(members)
      .innerJoin(groups, eq(groups.id, members.groupId))
      .where(and(eq(members.userId, viewerId), isNull(members.leftAt), eq(groups.parentId, gathering.id))),
  ]);

  const myCircleIds = new Set(mine.map((m) => m.circleId));
  return {
    members: memberRows,
    welcome: welcome[0] ?? null,
    circles: circleRows.map((c) => ({ ...c, isMember: myCircleIds.has(c.id) })),
  };
}

/** What the gathering map draws: circles with their members, what they've explored, what's open. */
export async function gatheringMapData(db: DB, gatheringId: string) {
  const [circleRows, memberRows, roundRows, answerRows] = await Promise.all([
    db
      .select({ id: groups.id, slug: groups.slug, name: groups.name, status: groups.status, color: groups.color })
      .from(groups)
      .where(and(eq(groups.parentId, gatheringId), notInArray(groups.status, ["closed", "expired"])))
      .orderBy(asc(groups.createdAt)),
    db
      .select({ circleId: members.groupId, userId: members.userId })
      .from(members)
      .innerJoin(groups, eq(groups.id, members.groupId))
      .where(and(eq(groups.parentId, gatheringId), isNull(members.leftAt)))
      .orderBy(asc(members.joinedAt)),
    db
      .select({ groupId: rounds.groupId, phase: rounds.phase, n: count() })
      .from(rounds)
      .where(and(eq(rounds.rootId, gatheringId), inArray(rounds.phase, ["open", "closed"])))
      .groupBy(rounds.groupId, rounds.phase),
    db
      .selectDistinct({ userId: responses.userId })
      .from(responses)
      .innerJoin(rounds, eq(rounds.id, responses.roundId))
      .where(and(eq(rounds.groupId, gatheringId), eq(rounds.phase, "open"))),
  ]);

  const tally = (groupId: string, phase: "open" | "closed") =>
    roundRows.find((r) => r.groupId === groupId && r.phase === phase)?.n ?? 0;

  return {
    circles: circleRows.map((c) => ({
      id: c.id, slug: c.slug, name: c.name, color: c.color, forming: c.status === "forming",
      members: memberRows.filter((m) => m.circleId === c.id).map((m) => m.userId),
      explored: tally(c.id, "closed"), open: tally(c.id, "open"),
    })),
    openQuestions: tally(gatheringId, "open"),
    answerers: answerRows.map((r) => r.userId),
  };
}
