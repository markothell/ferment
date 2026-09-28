// Circles: 4–12 members inside a community (PLAN §1, §2, §6).
//
// A circle is proposed, gathers people while it is forming, and forms when the
// fourth person joins. A proposal that never gets there expires after the
// community's proposal window (default 7 days).

import { and, asc, count, eq, isNull, lt } from "drizzle-orm";
import type { DB } from "@/db";
import { circleMembers, circles, communities, prompts, rounds, user } from "@/db/schema";
import { newId } from "@/lib/id";
import { requireMember } from "./communities";
import { normalizePrompt } from "./prompts";
import { settleCircle } from "./rounds";
import { refuse } from "./errors";
import { uniqueSlug } from "./slug";

export const CIRCLE_MIN = 4;
export const CIRCLE_MAX = 12;
const DESCRIPTION_MAX = 500;
const DAY_MS = 86_400_000;

export type Circle = typeof circles.$inferSelect;

export async function circleById(db: DB, circleId: string): Promise<Circle | null> {
  const [c] = await db.select().from(circles).where(eq(circles.id, circleId)).limit(1);
  return c ?? null;
}

export async function circleBySlug(db: DB, communityId: string, slug: string): Promise<Circle | null> {
  const [c] = await db
    .select()
    .from(circles)
    .where(and(eq(circles.communityId, communityId), eq(circles.slug, slug)))
    .limit(1);
  return c ?? null;
}

export async function activeMemberCount(db: DB, circleId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(circleMembers)
    .where(and(eq(circleMembers.circleId, circleId), isNull(circleMembers.leftAt)));
  return n;
}

export async function isCircleMember(db: DB, circleId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: circleMembers.userId })
    .from(circleMembers)
    .where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, userId), isNull(circleMembers.leftAt)))
    .limit(1);
  return Boolean(row);
}

/**
 * Propose a circle. The proposer holds the host seat and is its first member.
 * An optional first question is queued as the circle's first round.
 */
export async function createCircle(
  db: DB,
  {
    communityId, userId, name, description = "", firstQuestion = "", now = new Date(),
  }: { communityId: string; userId: string; name: string; description?: string; firstQuestion?: string; now?: Date },
): Promise<Circle> {
  await requireMember(db, communityId, userId);
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) refuse("Give the circle a name.");
  if (clean.length > 60) refuse("Circle names are 60 characters at most.");
  const desc = description.trim();
  if (desc.length > DESCRIPTION_MAX) refuse("That description is too long.");
  const first = firstQuestion.trim() ? normalizePrompt({ question: firstQuestion, shape: "story", telling: "voice" }) : null;

  const [community] = await db.select().from(communities).where(eq(communities.id, communityId)).limit(1);
  const slug = await uniqueSlug(clean, async (s) => Boolean(await circleBySlug(db, communityId, s)));

  return db.transaction(async (tx) => {
    let originPromptId: string | null = null;
    if (first) {
      originPromptId = newId();
      await tx.insert(prompts).values({ id: originPromptId, communityId, authorId: userId, ...first });
    }

    const [circle] = await tx
      .insert(circles)
      .values({
        id: newId(), communityId, slug, name: clean, description: desc,
        hostId: userId, proposedBy: userId, status: "forming", originPromptId,
        formingExpiresAt: new Date(now.getTime() + community.proposalExpiryDays * DAY_MS),
      })
      .returning();
    await tx.insert(circleMembers).values({ circleId: circle.id, userId, joinedAt: now });

    if (originPromptId) {
      await tx.insert(rounds).values({
        id: newId(), promptId: originPromptId, communityId, circleId: circle.id,
        authorId: userId, phase: "queued", queuedAt: now,
      });
    }
    return circle;
  });
}

/** "I'm in." Forms the circle when it reaches its minimum. */
export async function joinCircle(
  db: DB,
  { circleId, userId, now = new Date() }: { circleId: string; userId: string; now?: Date },
): Promise<{ formed: boolean }> {
  const circle = (await circleById(db, circleId)) ?? refuse("That circle doesn't exist.");
  await requireMember(db, circle.communityId, userId);
  if (circle.status === "closed") refuse("This circle has closed.");
  if (circle.status === "expired" || (circle.status === "forming" && circle.formingExpiresAt && circle.formingExpiresAt <= now)) {
    refuse("This proposal expired before it filled.");
  }
  if (await isCircleMember(db, circleId, userId)) return { formed: false };

  return db.transaction(async (tx) => {
    // Serialize joins on this circle so two people can't both take the last seat.
    await tx.select({ id: circles.id }).from(circles).where(eq(circles.id, circleId)).for("update");
    const n = await activeMemberCount(tx, circleId);
    if (n >= CIRCLE_MAX) refuse("This circle is full.");

    await tx
      .insert(circleMembers)
      .values({ circleId, userId, joinedAt: now })
      .onConflictDoUpdate({
        target: [circleMembers.circleId, circleMembers.userId],
        set: { leftAt: null, joinedAt: now },
      });

    if (circle.status === "forming" && n + 1 >= CIRCLE_MIN) {
      await tx
        .update(circles)
        .set({ status: "active", formedAt: now, formingExpiresAt: null })
        .where(eq(circles.id, circleId));
      return { formed: true };
    }
    return { formed: false };
  }).then(async (r) => {
    // Formed: its queued first question opens now.
    if (r.formed) await settleCircle(db, circleId, now);
    return r;
  });
}

/** Leaving keeps what you shared, named. A leaving host empties the seat. */
export async function leaveCircle(
  db: DB,
  { circleId, userId, now = new Date() }: { circleId: string; userId: string; now?: Date },
): Promise<void> {
  const circle = (await circleById(db, circleId)) ?? refuse("That circle doesn't exist.");
  if (!(await isCircleMember(db, circleId, userId))) return;
  await db.transaction(async (tx) => {
    await tx
      .update(circleMembers)
      .set({ leftAt: now })
      .where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, userId)));
    if (circle.hostId === userId) await tx.update(circles).set({ hostId: null }).where(eq(circles.id, circleId));
  });
}

/** Expire proposals whose window has passed. Returns the ids it expired. */
export async function expireProposals(db: DB, now = new Date()): Promise<string[]> {
  const rows = await db
    .update(circles)
    .set({ status: "expired" })
    .where(and(eq(circles.status, "forming"), lt(circles.formingExpiresAt, now)))
    .returning({ id: circles.id });
  return rows.map((r) => r.id);
}

/** Everything the circle page shows. Rounds are for members only. */
export async function circleHome(db: DB, circle: Circle, viewerId: string) {
  const members = await db
    .select({ userId: user.id, name: user.name, email: user.email, joinedAt: circleMembers.joinedAt })
    .from(circleMembers)
    .innerJoin(user, eq(user.id, circleMembers.userId))
    .where(and(eq(circleMembers.circleId, circle.id), isNull(circleMembers.leftAt)))
    .orderBy(asc(circleMembers.joinedAt));
  const isMember = members.some((m) => m.userId === viewerId);
  const roundRows = isMember
    ? await db
        .select({ id: rounds.id, phase: rounds.phase, question: prompts.question, authorId: rounds.authorId })
        .from(rounds)
        .innerJoin(prompts, eq(prompts.id, rounds.promptId))
        .where(eq(rounds.circleId, circle.id))
        .orderBy(asc(rounds.createdAt))
    : [];
  return { members, isMember, rounds: roundRows };
}
