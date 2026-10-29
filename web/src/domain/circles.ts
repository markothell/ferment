// Circles: groups of kind "circle", 4–12 members (PLAN §1, §2, §6; GROUPS.md).
//
// A circle is proposed, gathers people while it is forming, and forms when the
// fourth person joins. A proposal that never gets there expires after the
// gathering's proposal window (default 7 days). A circle sits inside a
// gathering today; the rules in lib/kinds.ts also let it stand on its own.

import { and, asc, count, eq, isNull, lt } from "drizzle-orm";
import type { DB } from "@/db";
import { groups, members, notifications, prompts, rounds, user } from "@/db/schema";
import { isCircleColor, type CircleColor } from "@/lib/circleColors";
import { newId } from "@/lib/id";
import { KINDS } from "@/lib/kinds";
import { groupById, membershipOf, NAME_MAX, requireMember, requireStartAllowance, slugTaken, type Gathering, type Group } from "./gatherings";
import { cleanTimer, normalizePrompt, type PromptInput } from "./prompts";
import { notifyCircle } from "./notifications";
import { settleCircle } from "./rounds";
import { refuse } from "./errors";
import { uniqueSlug } from "./slug";

export const CIRCLE_MIN = KINDS.circle.people.min;
export const CIRCLE_MAX = KINDS.circle.people.max!;
const DESCRIPTION_MAX = 500;
const DAY_MS = 86_400_000;

export type Circle = Group;

export async function circleById(db: DB, circleId: string): Promise<Circle | null> {
  const [c] = await db.select().from(groups).where(and(eq(groups.id, circleId), eq(groups.kind, "circle"))).limit(1);
  return c ?? null;
}

export async function activeMemberCount(db: DB, circleId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(members)
    .where(and(eq(members.groupId, circleId), isNull(members.leftAt)));
  return n;
}

export async function isCircleMember(db: DB, circleId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: members.userId })
    .from(members)
    .where(and(eq(members.groupId, circleId), eq(members.userId, userId), isNull(members.leftAt)))
    .limit(1);
  return Boolean(row);
}

/** A circle's first question: a whole round, with its shape and timer. A bare string is a story, told by voice. */
export type FirstQuestion = string | PromptInput;

function firstRound(firstQuestion: FirstQuestion, timerHours: number | string | null | undefined) {
  const input = typeof firstQuestion === "string" ? { question: firstQuestion, shape: "story" as const, telling: "voice" as const } : firstQuestion;
  if (!input.question.trim()) return null;
  return { prompt: normalizePrompt(input), timerHours: cleanTimer(timerHours) };
}

/**
 * Propose a circle. The proposer holds the host seat and is its first member.
 * An optional first question is queued as the circle's first round.
 */
export async function createCircle(
  db: DB,
  {
    gatheringId, userId, name, description = "", firstQuestion = "", timerHours = null, promptId = null, color = "saffron", now = new Date(),
  }: {
    gatheringId: string; userId: string; name: string; description?: string; now?: Date; color?: string;
    /** A new first question, or an existing prompt: "start a circle around this". */
    firstQuestion?: FirstQuestion; timerHours?: number | string | null; promptId?: string | null;
  },
): Promise<Circle> {
  await requireMember(db, gatheringId, userId);
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) refuse("Give the circle a name.");
  if (clean.length > 60) refuse("Circle names are 60 characters at most.");
  const desc = description.trim();
  if (desc.length > DESCRIPTION_MAX) refuse("That description is too long.");
  if (!isCircleColor(color)) refuse("Pick one of the colours.");
  const first = promptId ? null : firstRound(firstQuestion, timerHours);
  if (promptId) {
    const [existing] = await db.select({ rootId: prompts.rootId }).from(prompts).where(eq(prompts.id, promptId)).limit(1);
    if (!existing || existing.rootId !== gatheringId) refuse("That question isn't in this gathering.");
  }

  const gathering = (await groupById(db, gatheringId)) ?? refuse("That gathering isn't here.");
  const slug = await uniqueSlug(clean, (s) => slugTaken(db, s));

  return db.transaction(async (tx) => {
    let originPromptId: string | null = promptId;
    if (first) {
      originPromptId = newId();
      await tx.insert(prompts).values({ id: originPromptId, rootId: gatheringId, authorId: userId, ...first.prompt });
    }

    const [circle] = await tx
      .insert(groups)
      .values({
        id: newId(), kind: "circle", parentId: gatheringId, rootId: gathering.rootId, slug, name: clean, note: desc,
        hostId: userId, createdBy: userId, status: "forming", originPromptId, color: color as CircleColor, createdAt: now,
        formingExpiresAt: new Date(now.getTime() + gathering.proposalExpiryDays * DAY_MS),
      })
      .returning();
    await tx.insert(members).values({ groupId: circle.id, userId, joinedAt: now });

    if (originPromptId) {
      await tx.insert(rounds).values({
        id: newId(), promptId: originPromptId, groupId: circle.id, rootId: circle.rootId,
        authorId: userId, phase: "queued", queuedAt: now, timerHours: first?.timerHours ?? null,
      });
    }
    return circle;
  });
}

/**
 * Start a circle on its own (GROUPS.md §4): a root group of kind circle. You
 * host it and hold its first seat; it forms when the fourth person is in.
 * Its people come by your invitation (domain/invites.ts), and it can grow into
 * a gathering later (promoteCircle).
 */
export async function createLoneCircle(
  db: DB,
  { userId, name, description = "", firstQuestion = "", timerHours = null, color = "saffron", now = new Date() }:
  { userId: string; name: string; description?: string; firstQuestion?: FirstQuestion; timerHours?: number | string | null; color?: string; now?: Date },
): Promise<Circle> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) refuse("Give the circle a name.");
  if (clean.length > 60) refuse("Circle names are 60 characters at most.");
  const desc = description.trim();
  if (desc.length > DESCRIPTION_MAX) refuse("That description is too long.");
  if (!isCircleColor(color)) refuse("Pick one of the colours.");
  await requireStartAllowance(db, userId, now);
  const first = firstRound(firstQuestion, timerHours);
  const slug = await uniqueSlug(clean, (s) => slugTaken(db, s));
  const id = newId();

  return db.transaction(async (tx) => {
    // The group first: its prompt points at it as the root.
    await tx.insert(groups).values({
      id, kind: "circle", parentId: null, rootId: id, slug, name: clean, note: desc, hostId: userId, createdBy: userId,
      status: "forming", color: color as CircleColor, createdAt: now, formingExpiresAt: new Date(now.getTime() + 7 * DAY_MS),
    });
    // The host's seat; a root's host is also its member of role host, as a gathering's is.
    await tx.insert(members).values({ groupId: id, userId, role: "host", joinedAt: now });
    if (first) {
      const originPromptId = newId();
      await tx.insert(prompts).values({ id: originPromptId, rootId: id, authorId: userId, ...first.prompt });
      await tx.update(groups).set({ originPromptId }).where(eq(groups.id, id));
      await tx.insert(rounds).values({
        id: newId(), promptId: originPromptId, groupId: id, rootId: id, authorId: userId, phase: "queued", queuedAt: now, timerHours: first.timerHours,
      });
    }
    return (await tx.select().from(groups).where(eq(groups.id, id)))[0];
  });
}

/**
 * "Host a gathering around this circle" (GROUPS.md §4), one transaction: a
 * gathering is made, the circle moves under it, everything in the tree points
 * at the new root, every circle member is in the gathering, and the circle's
 * host hosts it. The circle keeps its slug. There is no demotion.
 */
export async function promoteCircle(
  db: DB,
  { circleId, userId, name, welcomeNote = "", now = new Date() }: { circleId: string; userId: string; name: string; welcomeNote?: string; now?: Date },
): Promise<Gathering> {
  const circle = (await circleById(db, circleId)) ?? refuse("That circle doesn't exist.");
  if (circle.parentId) refuse("This circle is already in a gathering.");
  if (circle.hostId !== userId) refuse("Only the circle's host can host a gathering around it.");
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) refuse("Give the gathering a name.");
  if (clean.length > NAME_MAX) refuse(`Names are ${NAME_MAX} characters at most.`);
  const note = welcomeNote.trim();
  const slug = await uniqueSlug(clean, (s) => slugTaken(db, s));
  const id = newId();

  return db.transaction(async (tx) => {
    const [gathering] = await tx
      .insert(groups)
      .values({ id, slug, kind: "gathering", parentId: null, rootId: id, name: clean, note, createdBy: userId, createdAt: now })
      .returning();
    // Its link, if any, was into a circle on its own; a circle inside a gathering has none (GROUPS.md §10).
    await tx.update(groups).set({ parentId: id, rootId: id, joinToken: null, joinOpen: false }).where(eq(groups.id, circle.id));
    await tx.update(prompts).set({ rootId: id }).where(eq(prompts.rootId, circle.id));
    await tx.update(rounds).set({ rootId: id }).where(eq(rounds.rootId, circle.id));
    await tx.update(notifications).set({ rootId: id }).where(eq(notifications.rootId, circle.id));
    const seated = await tx.select().from(members).where(and(eq(members.groupId, circle.id), isNull(members.leftAt)));
    await tx.insert(members).values(seated.map((m) => ({
      groupId: id, userId: m.userId, role: m.userId === userId ? ("host" as const) : ("member" as const),
      invitedBy: m.invitedBy, email: m.email, joinedAt: now,
    })));
    // Inside a gathering, a circle's host is marked by host_id alone; the member rows are plain.
    await tx.update(members).set({ role: "member" }).where(eq(members.groupId, circle.id));
    return gathering;
  });
}

/** The host picks the circle's colour (lib/circleColors.ts). */
export async function setCircleColor(db: DB, { circleId, userId, color }: { circleId: string; userId: string; color: string }) {
  const circle = await circleById(db, circleId);
  if (!circle) refuse("That circle isn't here.");
  if (circle.hostId !== userId) refuse("Only the circle's host can change its colour.");
  if (!isCircleColor(color)) refuse("Pick one of the colours.");
  await db.update(groups).set({ color }).where(eq(groups.id, circleId));
}

/**
 * "I'm in." Only while a circle is forming: a proposal is an open invitation.
 * Once it runs, a seat is the circle's to give (domain/seats.ts).
 */
export async function joinCircle(
  db: DB,
  { circleId, userId, now = new Date() }: { circleId: string; userId: string; now?: Date },
): Promise<{ formed: boolean }> {
  const circle = (await circleById(db, circleId)) ?? refuse("That circle doesn't exist.");
  if (circle.status === "active" || circle.status === "idle") {
    if (await isCircleMember(db, circleId, userId)) return { formed: false };
    refuse("This circle is already running. Ask to join instead.");
  }
  return seatInCircle(db, { circleId, userId, now });
}

/**
 * Put someone in a circle. Forms it when it reaches its minimum. Called by
 * "I'm in" on a forming circle and by an admitted seat (domain/seats.ts);
 * nothing else should, since it asks no one. Someone in a circle is in its
 * gathering too: usually they were invited to the gathering first; someone
 * whose invitation named the circle (`invited`) gets the gathering row here.
 */
export async function seatInCircle(
  db: DB,
  { circleId, userId, invited = false, now = new Date() }: { circleId: string; userId: string; invited?: boolean; now?: Date },
): Promise<{ formed: boolean }> {
  const circle = (await circleById(db, circleId)) ?? refuse("That circle doesn't exist.");
  if (circle.parentId) {
    if (invited && !(await membershipOf(db, circle.parentId, userId))) {
      await db.insert(members).values({ groupId: circle.parentId, userId, joinedAt: now }).onConflictDoNothing();
    }
    await requireMember(db, circle.parentId, userId);
  }
  if (circle.status === "closed") refuse("This circle has closed.");
  if (circle.status === "expired" || (circle.status === "forming" && circle.formingExpiresAt && circle.formingExpiresAt <= now)) {
    refuse("This proposal expired before it filled.");
  }
  if (await isCircleMember(db, circleId, userId)) return { formed: false };

  return db.transaction(async (tx) => {
    // Serialize joins on this circle so two people can't both take the last seat.
    await tx.select({ id: groups.id }).from(groups).where(eq(groups.id, circleId)).for("update");
    const n = await activeMemberCount(tx, circleId);
    if (n >= CIRCLE_MAX) refuse("This circle is full.");

    await tx
      .insert(members)
      .values({ groupId: circleId, userId, joinedAt: now })
      .onConflictDoUpdate({
        target: [members.groupId, members.userId],
        set: { leftAt: null, joinedAt: now },
      });

    if (circle.status === "forming" && n + 1 >= CIRCLE_MIN) {
      await tx
        .update(groups)
        .set({ status: "active", formedAt: now, formingExpiresAt: null })
        .where(eq(groups.id, circleId));
      return { formed: true };
    }
    return { formed: false };
  }).then(async (r) => {
    // Formed: tell everyone in it, and its queued first question opens now.
    if (r.formed) {
      await notifyCircle(db, circleId, { kind: "circle_formed", gatheringId: circle.rootId, actorId: userId, now });
      await settleCircle(db, circleId, now);
    }
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
      .update(members)
      .set({ leftAt: now })
      .where(and(eq(members.groupId, circleId), eq(members.userId, userId)));
    if (circle.hostId === userId) await tx.update(groups).set({ hostId: null }).where(eq(groups.id, circleId));
  });
}

/** Expire proposals whose window has passed. Returns the ids it expired. */
export async function expireProposals(db: DB, now = new Date()): Promise<string[]> {
  const rows = await db
    .update(groups)
    .set({ status: "expired" })
    .where(and(eq(groups.kind, "circle"), eq(groups.status, "forming"), lt(groups.formingExpiresAt, now)))
    .returning({ id: groups.id });
  return rows.map((r) => r.id);
}

/** Everything the circle page shows. Rounds are for members only; how many have closed is for anyone. */
export async function circleHome(db: DB, circle: Circle, viewerId: string) {
  const memberRows = await db
    .select({ userId: user.id, name: user.name, email: user.email, joinedAt: members.joinedAt })
    .from(members)
    .innerJoin(user, eq(user.id, members.userId))
    .where(and(eq(members.groupId, circle.id), isNull(members.leftAt)))
    .orderBy(asc(members.joinedAt));
  const isMember = memberRows.some((m) => m.userId === viewerId);
  const roundRows = isMember
    ? await db
        .select({ id: rounds.id, phase: rounds.phase, question: prompts.question, authorId: rounds.authorId })
        .from(rounds)
        .innerJoin(prompts, eq(prompts.id, rounds.promptId))
        .where(eq(rounds.groupId, circle.id))
        .orderBy(asc(rounds.createdAt))
    : [];
  // A count anyone in the gathering may see: how many rounds have closed.
  const [{ explored }] = await db
    .select({ explored: count() })
    .from(rounds)
    .where(and(eq(rounds.groupId, circle.id), eq(rounds.phase, "closed")));
  return { members: memberRows, isMember, rounds: roundRows, explored };
}
