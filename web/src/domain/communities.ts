// Communities: the social home and the outermost circle (PLAN §1, §4).

import { and, asc, count, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import type { DB } from "@/db";
import { circleMembers, circles, communities, communityMembers, prompts, responses, rounds, user } from "@/db/schema";
import { hostAllowlist, normalizeEmail } from "@/lib/access";
import { newId } from "@/lib/id";
import { refuse } from "./errors";
import { normalizePrompt } from "./prompts";
import { uniqueSlug } from "./slug";

export const NAME_MAX = 60;
export const NOTE_MAX = 2000;

export type Community = typeof communities.$inferSelect;
export type Membership = typeof communityMembers.$inferSelect;

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) refuse("Give it a name.");
  if (name.length > NAME_MAX) refuse(`Names are ${NAME_MAX} characters at most.`);
  return name;
}

export async function createCommunity(
  db: DB,
  { userId, userEmail, name, welcomeNote = "" }: { userId: string; userEmail: string; name: string; welcomeNote?: string },
): Promise<Community> {
  if (!hostAllowlist().has(normalizeEmail(userEmail))) refuse("Starting a community is invite-only for now.");
  const clean = cleanName(name);
  const note = welcomeNote.trim();
  if (note.length > NOTE_MAX) refuse("That welcome note is too long.");

  const slug = await uniqueSlug(clean, async (s) =>
    Boolean((await db.select({ id: communities.id }).from(communities).where(eq(communities.slug, s)).limit(1))[0]),
  );

  return db.transaction(async (tx) => {
    const [community] = await tx
      .insert(communities)
      .values({ id: newId(), slug, name: clean, welcomeNote: note, createdBy: userId })
      .returning();
    await tx.insert(communityMembers).values({ communityId: community.id, userId, role: "host" });
    return community;
  });
}

export async function communityBySlug(db: DB, slug: string): Promise<Community | null> {
  const [c] = await db.select().from(communities).where(eq(communities.slug, slug)).limit(1);
  return c ?? null;
}

export async function membershipOf(db: DB, communityId: string, userId: string): Promise<Membership | null> {
  const [m] = await db
    .select()
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)))
    .limit(1);
  return m ?? null;
}

export async function requireMember(db: DB, communityId: string, userId: string): Promise<Membership> {
  return (await membershipOf(db, communityId, userId)) ?? refuse("You're not a member of this community.");
}

export async function requireHost(db: DB, communityId: string, userId: string): Promise<Membership> {
  const m = await requireMember(db, communityId, userId);
  if (m.role !== "host") refuse("Only a host can do that.");
  return m;
}

export async function memberCount(db: DB, communityId: string): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(communityMembers).where(eq(communityMembers.communityId, communityId));
  return n;
}

/** Your communities, without the ones you've archived. */
export async function listMyCommunities(db: DB, userId: string) {
  return db
    .select({ id: communities.id, slug: communities.slug, name: communities.name, role: communityMembers.role })
    .from(communityMembers)
    .innerJoin(communities, eq(communities.id, communityMembers.communityId))
    .where(and(eq(communityMembers.userId, userId), isNull(communityMembers.archivedAt)))
    .orderBy(asc(communities.name));
}

/** The ones you've archived, so you can bring them back. */
export async function listMyArchived(db: DB, userId: string) {
  return db
    .select({ id: communities.id, slug: communities.slug, name: communities.name })
    .from(communityMembers)
    .innerJoin(communities, eq(communities.id, communityMembers.communityId))
    .where(and(eq(communityMembers.userId, userId), isNotNull(communityMembers.archivedAt)))
    .orderBy(asc(communities.name));
}

/**
 * Move a community off your own list, or back onto it. It's yours alone: the
 * community, its members and its pages are untouched, and you can still open it.
 */
export async function setArchived(
  db: DB,
  { communityId, userId, archived, now = new Date() }: { communityId: string; userId: string; archived: boolean; now?: Date },
): Promise<void> {
  await requireMember(db, communityId, userId);
  await db
    .update(communityMembers)
    .set({ archivedAt: archived ? now : null })
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)));
}

export async function updateWelcomeNote(
  db: DB,
  { communityId, userId, note }: { communityId: string; userId: string; note: string },
): Promise<void> {
  await requireHost(db, communityId, userId);
  const clean = note.trim();
  if (clean.length > NOTE_MAX) refuse("That welcome note is too long.");
  await db.update(communities).set({ welcomeNote: clean }).where(eq(communities.id, communityId));
}

/**
 * The welcome question: an open question every newcomer is invited to answer
 * (PLAN §4). A story, voice first, on an open wall, and it never closes.
 * Rewording it is free until someone has answered; after that a new question
 * replaces it and the old one closes with its answers intact.
 */
export async function setWelcomeQuestion(
  db: DB,
  { communityId, userId, question, now = new Date() }: { communityId: string; userId: string; question: string; now?: Date },
): Promise<void> {
  await requireHost(db, communityId, userId);
  const prompt = normalizePrompt({ question, shape: "story", telling: "voice", reveal: "open" });
  const q = prompt.question;

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ roundId: rounds.id, promptId: rounds.promptId })
      .from(rounds)
      .where(and(eq(rounds.communityId, communityId), eq(rounds.welcome, true)))
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
    await tx.insert(prompts).values({ id: promptId, communityId, authorId: userId, ...prompt });
    await tx.insert(rounds).values({
      id: newId(), promptId, communityId, authorId: userId,
      welcome: true, phase: "open", openedAt: now, editAfterClose: true,
    });
  });
}

/** Everything the community page shows, for a member. */
export async function communityHome(db: DB, community: Community, viewerId: string) {
  const [members, welcome, circleRows, mine] = await Promise.all([
    db
      .select({ userId: user.id, name: user.name, email: user.email, role: communityMembers.role, joinedAt: communityMembers.joinedAt })
      .from(communityMembers)
      .innerJoin(user, eq(user.id, communityMembers.userId))
      .where(eq(communityMembers.communityId, community.id))
      .orderBy(asc(communityMembers.joinedAt)),
    db
      .select({ roundId: rounds.id, question: prompts.question })
      .from(rounds)
      .innerJoin(prompts, eq(prompts.id, rounds.promptId))
      .where(and(eq(rounds.communityId, community.id), eq(rounds.welcome, true)))
      .limit(1),
    db
      .select({
        id: circles.id, slug: circles.slug, name: circles.name, description: circles.description,
        status: circles.status, color: circles.color, hostId: circles.hostId, formingExpiresAt: circles.formingExpiresAt,
        members: count(circleMembers.userId),
      })
      .from(circles)
      .leftJoin(circleMembers, and(eq(circleMembers.circleId, circles.id), isNull(circleMembers.leftAt)))
      .where(and(eq(circles.communityId, community.id), notInArray(circles.status, ["closed", "expired"])))
      .groupBy(circles.id)
      .orderBy(asc(circles.createdAt)),
    db
      .select({ circleId: circleMembers.circleId })
      .from(circleMembers)
      .innerJoin(circles, eq(circles.id, circleMembers.circleId))
      .where(and(eq(circleMembers.userId, viewerId), isNull(circleMembers.leftAt), eq(circles.communityId, community.id))),
  ]);

  const myCircleIds = new Set(mine.map((m) => m.circleId));
  return {
    members,
    welcome: welcome[0] ?? null,
    circles: circleRows.map((c) => ({ ...c, isMember: myCircleIds.has(c.id) })),
  };
}

/** What the community map draws: circles with their members, what they've explored, what's open. */
export async function communityMapData(db: DB, communityId: string) {
  const [circleRows, memberRows, roundRows, answerRows] = await Promise.all([
    db
      .select({ id: circles.id, slug: circles.slug, name: circles.name, status: circles.status, color: circles.color })
      .from(circles)
      .where(and(eq(circles.communityId, communityId), notInArray(circles.status, ["closed", "expired"])))
      .orderBy(asc(circles.createdAt)),
    db
      .select({ circleId: circleMembers.circleId, userId: circleMembers.userId })
      .from(circleMembers)
      .innerJoin(circles, eq(circles.id, circleMembers.circleId))
      .where(and(eq(circles.communityId, communityId), isNull(circleMembers.leftAt)))
      .orderBy(asc(circleMembers.joinedAt)),
    db
      .select({ circleId: rounds.circleId, phase: rounds.phase, n: count() })
      .from(rounds)
      .where(and(eq(rounds.communityId, communityId), inArray(rounds.phase, ["open", "closed"])))
      .groupBy(rounds.circleId, rounds.phase),
    db
      .selectDistinct({ userId: responses.userId })
      .from(responses)
      .innerJoin(rounds, eq(rounds.id, responses.roundId))
      .where(and(eq(rounds.communityId, communityId), isNull(rounds.circleId), eq(rounds.phase, "open"))),
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
