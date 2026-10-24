// Seats: how a running circle grows (PLAN §11; design/ferment/archive/invitations.html).
//
//   waiting ─(a third of members support, at least 2 · or the host makes room)→ admitted
//   waiting ─(the host: not now)→ declined · (the asker or the person: withdraw)→ withdrawn
//   waiting ─(14 days)→ lapsed
//
// A seat is for someone already in the gathering (user_id), who sits down at
// once, or for someone whose invitation is on its way (invite_id), whose seat
// is held until they arrive (domain/invites.ts#acceptInvite). A member who
// suggests someone counts as a supporter; a person asking for themselves
// doesn't, since they aren't in the circle yet. Forming circles take
// "I'm in" directly (domain/circles.ts#joinCircle).

import { and, count, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { invites, members, seatRequests, seatSupports, user } from "@/db/schema";
import { newId } from "@/lib/id";
import { displayName } from "@/lib/names";
import { CIRCLE_MAX, activeMemberCount, circleById, isCircleMember, seatInCircle, type Circle } from "./circles";
import { membershipOf, requireMember } from "./gatherings";
import { refuse } from "./errors";
import { notifyCircle, notifyOne } from "./notifications";
import { approvalsNeeded } from "./rounds";

export type SeatRequest = typeof seatRequests.$inferSelect;

export const ASK_DAYS = 14;
const DAY_MS = 86_400_000;
const NOTE_MAX = 500;

const running = (c: Circle) => c.status === "active" || c.status === "idle";

async function requestById(db: DB, id: string): Promise<SeatRequest> {
  const [r] = await db.select().from(seatRequests).where(eq(seatRequests.id, id)).limit(1);
  return r ?? refuse("That ask doesn't exist.");
}

/** Seats taken, plus seats held for people on their way. */
export async function seatsSpoken(db: DB, circleId: string): Promise<number> {
  const [{ held }] = await db
    .select({ held: count() })
    .from(seatRequests)
    .innerJoin(invites, eq(invites.id, seatRequests.inviteId))
    .where(and(eq(seatRequests.groupId, circleId), eq(seatRequests.status, "admitted"), eq(invites.status, "pending")));
  return (await activeMemberCount(db, circleId)) + held;
}

/**
 * Open an ask. Internal: askForSeat and domain/invites.ts check who may ask.
 * On a forming circle the seat is admitted at once, since anyone may join it.
 */
export async function openSeat(
  db: DB,
  { circle, askedBy, userId = null, inviteId = null, note = "", admitted = false, now }:
  { circle: Circle; askedBy: string; userId?: string | null; inviteId?: string | null; note?: string; now: Date;
    /** The host has made room already: an invitation to a circle on its own. */
    admitted?: boolean },
): Promise<SeatRequest> {
  if (circle.status === "closed" || circle.status === "expired") refuse("This circle isn't running.");
  if ((await seatsSpoken(db, circle.id)) >= CIRCLE_MAX) refuse("This circle is full.");
  const forming = circle.status === "forming" || admitted;
  const [req] = await db
    .insert(seatRequests)
    .values({
      id: newId(), groupId: circle.id, userId, inviteId, askedBy, note: note.trim(), createdAt: now,
      expiresAt: new Date(now.getTime() + ASK_DAYS * DAY_MS),
      ...(forming ? { status: "admitted" as const, decidedAt: now, decidedBy: askedBy } : {}),
    })
    .returning();
  if (forming) return req;

  if (await isCircleMember(db, circle.id, askedBy)) {
    await db.insert(seatSupports).values({ requestId: req.id, userId: askedBy, createdAt: now });
  }
  const after = await maybeAdmit(db, req, askedBy, now);
  if (after.status === "waiting") {
    await notifyCircle(db, circle.id, { kind: "seat_requested", gatheringId: circle.rootId, actorId: askedBy, seatRequestId: req.id, now });
  }
  return after;
}

/** Ask for a seat in a running circle: for yourself, or (as a member of it) for someone in the gathering. */
export async function askForSeat(
  db: DB,
  { circleId, userId, forUserId = userId, note = "", now = new Date() }:
  { circleId: string; userId: string; forUserId?: string; note?: string; now?: Date },
): Promise<SeatRequest> {
  const circle = (await circleById(db, circleId)) ?? refuse("That circle doesn't exist.");
  if (circle.parentId) await requireMember(db, circle.parentId, userId);
  if (circle.status === "forming") refuse("It's still forming, so anyone can join: say I'm in.");
  if (!running(circle)) refuse("This circle isn't running.");
  if (note.trim().length > NOTE_MAX) refuse("That note is too long.");

  const self = forUserId === userId;
  if (!self) {
    if (!(await isCircleMember(db, circleId, userId))) refuse("Only members can suggest someone for this circle.");
    if (!circle.parentId || !(await membershipOf(db, circle.parentId, forUserId))) refuse("They're not in the gathering yet. Suggest inviting them instead.");
  }
  if (await isCircleMember(db, circleId, forUserId)) refuse(self ? "You're already in this circle." : "They're already in this circle.");

  const [already] = await db
    .select({ id: seatRequests.id })
    .from(seatRequests)
    .where(and(eq(seatRequests.groupId, circleId), eq(seatRequests.userId, forUserId), eq(seatRequests.status, "waiting")))
    .limit(1);
  if (already) refuse(self ? "You've already asked. The circle is deciding." : "Someone has already asked for them. Support that instead.");

  return openSeat(db, { circle, askedBy: userId, userId: forUserId, note, now });
}

/** Admit when support reaches the circle's threshold and there's room. */
async function maybeAdmit(db: DB, req: SeatRequest, actorId: string | null, now: Date): Promise<SeatRequest> {
  if (req.status !== "waiting") return req;
  const circle = (await circleById(db, req.groupId))!;
  const seated = await activeMemberCount(db, circle.id);
  const [{ n }] = await db.select({ n: count() }).from(seatSupports).where(eq(seatSupports.requestId, req.id));
  if (n < approvalsNeeded(circle, seated)) return req;
  if ((await seatsSpoken(db, circle.id)) >= CIRCLE_MAX) return req; // full: it waits for a seat to free
  return admit(db, req, circle, actorId, now);
}

async function admit(db: DB, req: SeatRequest, circle: Circle, decidedBy: string | null, now: Date): Promise<SeatRequest> {
  const [done] = await db
    .update(seatRequests)
    .set({ status: "admitted", decidedAt: now, decidedBy })
    .where(and(eq(seatRequests.id, req.id), eq(seatRequests.status, "waiting")))
    .returning();
  if (!done) return requestById(db, req.id);
  // Someone already here sits down now; someone on their way, when they arrive.
  if (done.userId) {
    await seatInCircle(db, { circleId: circle.id, userId: done.userId, now });
    await notifyCircle(db, circle.id, { kind: "seat_admitted", gatheringId: circle.rootId, actorId: decidedBy, seatRequestId: done.id, now });
  }
  return done;
}

async function requireWaiting(db: DB, requestId: string) {
  const req = await requestById(db, requestId);
  if (req.status !== "waiting") refuse("That's already been decided.");
  const circle = (await circleById(db, req.groupId))!;
  return { req, circle };
}

/** One support per member, while the ask is waiting. */
export async function toggleSeatSupport(db: DB, { requestId, userId, now = new Date() }: { requestId: string; userId: string; now?: Date }): Promise<boolean> {
  const { req, circle } = await requireWaiting(db, requestId);
  if (!(await isCircleMember(db, circle.id, userId))) refuse("Only members can make room.");
  const removed = await db
    .delete(seatSupports)
    .where(and(eq(seatSupports.requestId, requestId), eq(seatSupports.userId, userId)))
    .returning();
  if (removed.length) return false;
  await db.insert(seatSupports).values({ requestId, userId, createdAt: now });
  await maybeAdmit(db, req, userId, now);
  return true;
}

/** The circle's host admits at once, as they can promote a question. */
export async function makeRoom(db: DB, { requestId, userId, now = new Date() }: { requestId: string; userId: string; now?: Date }): Promise<void> {
  const { req, circle } = await requireWaiting(db, requestId);
  if (circle.hostId !== userId) refuse("Only the host can make room.");
  if ((await seatsSpoken(db, circle.id)) >= CIRCLE_MAX) refuse("This circle is full.");
  await admit(db, req, circle, userId, now);
}

/** The circle's host: not now. The person and whoever asked are told, quietly. */
export async function declineSeat(db: DB, { requestId, userId, now = new Date() }: { requestId: string; userId: string; now?: Date }): Promise<void> {
  const { req, circle } = await requireWaiting(db, requestId);
  if (circle.hostId !== userId) refuse("Only the host can say not now.");
  await db.update(seatRequests).set({ status: "declined", decidedAt: now, decidedBy: userId }).where(eq(seatRequests.id, req.id));
  const m = { kind: "seat_declined" as const, gatheringId: circle.rootId, actorId: userId, circleId: circle.id, seatRequestId: req.id, now };
  if (req.userId) await notifyOne(db, req.userId, m);
  if (req.askedBy !== req.userId) await notifyOne(db, req.askedBy, m);
}

/** Whoever asked, or the person it's for, takes it back while it waits. */
export async function withdrawSeat(db: DB, { requestId, userId, now = new Date() }: { requestId: string; userId: string; now?: Date }): Promise<void> {
  const { req } = await requireWaiting(db, requestId);
  if (req.askedBy !== userId && req.userId !== userId) refuse("Only whoever asked can withdraw it.");
  await db.update(seatRequests).set({ status: "withdrawn", decidedAt: now, decidedBy: userId }).where(eq(seatRequests.id, req.id));
}

/** The clock: asks that waited 14 days lapse, and whoever asked is told. Seats tied to an invitation lapse with it. */
export async function lapseSeats(db: DB, now = new Date()): Promise<number> {
  const due = await db
    .update(seatRequests)
    .set({ status: "lapsed", decidedAt: now })
    .where(and(eq(seatRequests.status, "waiting"), isNull(seatRequests.inviteId), lte(seatRequests.expiresAt, now)))
    .returning();
  for (const r of due) {
    const circle = (await circleById(db, r.groupId))!;
    await notifyOne(db, r.askedBy, { kind: "ask_lapsed", gatheringId: circle.rootId, circleId: circle.id, seatRequestId: r.id, now });
  }
  return due.length;
}

// ── Reading ───────────────────────────────────────────────────────────────

/** What a circle's members see under "Asking to join". */
export async function waitingSeats(db: DB, circle: Circle, viewerId: string) {
  const rows = await db
    .select({
      id: seatRequests.id, userId: seatRequests.userId, askedBy: seatRequests.askedBy, note: seatRequests.note,
      createdAt: seatRequests.createdAt, expiresAt: seatRequests.expiresAt,
      candidateName: user.name, candidateEmail: user.email, inviteName: invites.name,
      askerName: sql<string>`(select ${user.name} from ${user} where ${user.id} = ${seatRequests.askedBy})`,
      askerEmail: sql<string>`(select ${user.email} from ${user} where ${user.id} = ${seatRequests.askedBy})`,
      supports: sql<number>`(select count(*)::int from ${seatSupports} where ${seatSupports.requestId} = ${seatRequests.id})`,
      supportedByMe: sql<boolean>`exists(select 1 from ${seatSupports} where ${seatSupports.requestId} = ${seatRequests.id} and ${seatSupports.userId} = ${viewerId})`,
    })
    .from(seatRequests)
    .leftJoin(user, eq(user.id, seatRequests.userId))
    .leftJoin(invites, eq(invites.id, seatRequests.inviteId))
    .where(and(eq(seatRequests.groupId, circle.id), eq(seatRequests.status, "waiting")))
    .orderBy(seatRequests.createdAt);
  const needed = approvalsNeeded(circle, await activeMemberCount(db, circle.id));
  return rows.map((r) => ({
    id: r.id, note: r.note, createdAt: r.createdAt, expiresAt: r.expiresAt, supports: r.supports, supportedByMe: r.supportedByMe, needed,
    name: r.candidateEmail ? displayName({ name: r.candidateName, email: r.candidateEmail }) : r.inviteName || "Someone new",
    newcomer: r.userId === null,
    selfAsked: r.userId !== null && r.userId === r.askedBy,
    askedBy: r.askedBy,
    asker: displayName({ name: r.askerName, email: r.askerEmail }),
  }));
}

/** Your own ask for a seat in this circle, if one is waiting. */
export async function myAsk(db: DB, circleId: string, userId: string) {
  const [r] = await db
    .select({ id: seatRequests.id, createdAt: seatRequests.createdAt, supports: sql<number>`(select count(*)::int from ${seatSupports} where ${seatSupports.requestId} = ${seatRequests.id})` })
    .from(seatRequests)
    .where(and(eq(seatRequests.groupId, circleId), eq(seatRequests.userId, userId), eq(seatRequests.status, "waiting")))
    .limit(1);
  return r ?? null;
}

/** Gathering members who could be suggested for a circle: not in it, not already asked for. */
export async function suggestableFor(db: DB, circle: Circle, people: { userId: string; name: string; email: string }[]) {
  const [inside, asked] = await Promise.all([
    db.select({ userId: members.userId }).from(members).where(and(eq(members.groupId, circle.id), isNull(members.leftAt))),
    db.select({ userId: seatRequests.userId }).from(seatRequests).where(and(eq(seatRequests.groupId, circle.id), eq(seatRequests.status, "waiting"))),
  ]);
  const out = new Set([...inside, ...asked].map((r) => r.userId));
  return people.filter((m) => !out.has(m.userId));
}

/** Seats held for an invitation, by state: domain/invites.ts uses these. */
export async function seatsForInvite(db: DB, inviteId: string, statuses: SeatRequest["status"][] = ["waiting", "admitted"]) {
  return db
    .select()
    .from(seatRequests)
    .where(and(eq(seatRequests.inviteId, inviteId), inArray(seatRequests.status, statuses)));
}
