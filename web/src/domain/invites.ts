// Invitations come from a person (PLAN §4) and a host says yes (PLAN §11):
//
//   nominated ─(a host confirms)→ pending ─(they come in)→ accepted
//   nominated ─(a host: not now)→ declined · (the suggester withdraws)→ revoked · (14 days)→ lapsed
//
// A host's own suggestion starts at pending. Nothing reaches the person until
// it's pending; the email then still comes from whoever suggested them. A
// circle the invitation names is a seat request (domain/seats.ts), decided by
// the circle alongside the host. Only the token's hash is stored, and only
// once confirmed; the token lives in the email.

import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";
import * as z from "zod";
import type { DB } from "@/db";
import { groups, invites, members, seatRequests, seatSupports, user } from "@/db/schema";
import { normalizeEmail } from "@/lib/access";
import { newId } from "@/lib/id";
import { displayName } from "@/lib/names";
import { activeMemberCount, circleById, isCircleMember, seatInCircle } from "./circles";
import { memberCount, requireHost, requireMember } from "./gatherings";
import { Refusal, refuse } from "./errors";
import { notifyCircle, notifyHosts, notifyOne } from "./notifications";
import { approvalsNeeded } from "./rounds";
import { ASK_DAYS, openSeat, seatsForInvite } from "./seats";

const INVITE_DAYS = 30;
const DAY_MS = 86_400_000;
const NOTE_MAX = 500;
const NAME_MAX = 60;

export type Invite = typeof invites.$inferSelect;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

async function inviteById(db: DB, id: string): Promise<Invite> {
  const [i] = await db.select().from(invites).where(eq(invites.id, id)).limit(1);
  return i ?? refuse("That invitation doesn't exist.");
}

async function requireRoom(db: DB, gatheringId: string) {
  const [gathering] = await db.select().from(groups).where(eq(groups.id, gatheringId)).limit(1);
  if ((await memberCount(db, gatheringId)) >= gathering.maxMembers) refuse("This gathering is full.");
}

/** The invitation or suggestion still live for this email, if any. */
async function liveFor(db: DB, gatheringId: string, email: string, now: Date) {
  const [row] = await db
    .select({ invite: invites, byName: user.name, byEmail: user.email })
    .from(invites)
    .innerJoin(user, eq(user.id, invites.invitedBy))
    .where(and(
      eq(invites.groupId, gatheringId), eq(invites.email, email),
      inArray(invites.status, ["nominated", "pending"]), gt(invites.expiresAt, now),
    ))
    .limit(1);
  return row ?? null;
}

/** Retire an invitation's seats along with it. */
async function closeSeats(db: DB, inviteId: string, status: "withdrawn" | "lapsed", now: Date) {
  await db
    .update(seatRequests)
    .set({ status, decidedAt: now })
    .where(and(eq(seatRequests.inviteId, inviteId), inArray(seatRequests.status, ["waiting", "admitted"])));
}

/**
 * Suggest someone. A member's suggestion waits for a host; a host's goes out
 * at once (the token comes back to send). A circle named here gets a seat
 * request, which the circle decides.
 */
export async function createInvite(
  db: DB,
  {
    gatheringId, invitedBy, email, name = "", circleId = null, note = "", now = new Date(),
  }: { gatheringId: string; invitedBy: string; email: string; name?: string; circleId?: string | null; note?: string; now?: Date },
): Promise<{ inviteId: string; status: "nominated" | "pending"; token: string | null; email: string }> {
  const m = await requireMember(db, gatheringId, invitedBy);
  const host = m.role === "host";
  const parsed = z.email().safeParse(email.trim());
  if (!parsed.success) refuse("That doesn't look like an email address.");
  const to = normalizeEmail(parsed.data);
  const who = name.trim().replace(/\s+/g, " ");
  if (!who && !host) refuse("Say who they are.");
  if (who.length > NAME_MAX) refuse(`Names are ${NAME_MAX} characters at most.`);
  if (note.trim().length > NOTE_MAX) refuse("That note is too long.");

  const [already] = await db
    .select({ userId: members.userId })
    .from(members)
    .innerJoin(user, eq(user.id, members.userId))
    .where(and(eq(members.groupId, gatheringId), eq(user.email, to)))
    .limit(1);
  if (already) refuse("They're already in this gathering.");
  await requireRoom(db, gatheringId);

  const circle = circleId ? await circleById(db, circleId) : null;
  if (circleId) {
    if (!circle || circle.parentId !== gatheringId) refuse("That circle isn't in this gathering.");
    if (!(await isCircleMember(db, circleId, invitedBy))) refuse("You can only suggest people for circles you're in.");
  }

  const live = await liveFor(db, gatheringId, to, now);
  if (live && !host) {
    const by = live.invite.invitedBy === invitedBy ? "You" : displayName({ name: live.byName, email: live.byEmail });
    refuse(live.invite.status === "nominated" ? `${by} already suggested them. A host will decide.` : "They've already been invited.");
  }

  const inviteId = newId();
  const sent = host ? newToken() : null;
  await db.transaction(async (tx) => {
    // A host re-inviting replaces what was there.
    if (live) {
      await tx.update(invites).set({ status: "revoked" }).where(eq(invites.id, live.invite.id));
      await closeSeats(tx, live.invite.id, "withdrawn", now);
    }
    await tx.insert(invites).values({
      id: inviteId, groupId: gatheringId, email: to, name: who, invitedBy, note: note.trim(), createdAt: now,
      status: host ? "pending" : "nominated",
      tokenHash: sent?.tokenHash ?? null,
      expiresAt: new Date(now.getTime() + (host ? INVITE_DAYS : ASK_DAYS) * DAY_MS),
      ...(host ? { confirmedBy: invitedBy, confirmedAt: now } : {}),
    });
  });

  if (circle) await openSeat(db, { circle, askedBy: invitedBy, inviteId, note, now });
  if (!host) await notifyHosts(db, { kind: "invite_suggested", gatheringId, actorId: invitedBy, inviteId, now });
  return { inviteId, status: host ? "pending" : "nominated", token: sent?.token ?? null, email: to };
}

/** A host says yes: the invitation goes out, from whoever suggested them. */
export async function confirmInvite(
  db: DB,
  { inviteId, userId, now = new Date() }: { inviteId: string; userId: string; now?: Date },
): Promise<{ token: string; email: string }> {
  const invite = await inviteById(db, inviteId);
  await requireHost(db, invite.groupId, userId);
  if (invite.status !== "nominated") refuse("That's already been decided.");
  if (invite.expiresAt <= now) refuse("That suggestion lapsed.");
  await requireRoom(db, invite.groupId);

  const { token, tokenHash } = newToken();
  const [done] = await db
    .update(invites)
    .set({ status: "pending", tokenHash, confirmedBy: userId, confirmedAt: now, expiresAt: new Date(now.getTime() + INVITE_DAYS * DAY_MS) })
    .where(and(eq(invites.id, inviteId), eq(invites.status, "nominated")))
    .returning();
  if (!done) refuse("Another host got to it first.");
  await notifyOne(db, invite.invitedBy, { kind: "invite_confirmed", gatheringId: invite.groupId, actorId: userId, inviteId, now });
  return { token, email: invite.email };
}

/** A host: not now. Whoever suggested them is told, with the host's note if there is one. */
export async function declineInvite(
  db: DB,
  { inviteId, userId, note = "", now = new Date() }: { inviteId: string; userId: string; note?: string; now?: Date },
): Promise<void> {
  const invite = await inviteById(db, inviteId);
  await requireHost(db, invite.groupId, userId);
  if (invite.status !== "nominated") refuse("That's already been decided.");
  if (note.trim().length > NOTE_MAX) refuse("That note is too long.");
  await db.update(invites).set({ status: "declined", hostNote: note.trim() }).where(eq(invites.id, inviteId));
  await closeSeats(db, inviteId, "withdrawn", now);
  await notifyOne(db, invite.invitedBy, { kind: "invite_declined", gatheringId: invite.groupId, actorId: userId, inviteId, now });
}

/** Whoever suggested someone takes it back before a host decides. */
export async function withdrawInvite(db: DB, { inviteId, userId, now = new Date() }: { inviteId: string; userId: string; now?: Date }): Promise<void> {
  const invite = await inviteById(db, inviteId);
  if (invite.invitedBy !== userId) refuse("Only whoever suggested them can withdraw it.");
  if (invite.status !== "nominated") refuse("That's already been decided.");
  await db.update(invites).set({ status: "revoked" }).where(eq(invites.id, inviteId));
  await closeSeats(db, inviteId, "withdrawn", now);
}

/** The clock: suggestions no host decided in 14 days lapse, and the suggester is told. */
export async function lapseInvites(db: DB, now = new Date()): Promise<number> {
  const due = await db
    .update(invites)
    .set({ status: "lapsed" })
    .where(and(eq(invites.status, "nominated"), lte(invites.expiresAt, now)))
    .returning();
  for (const i of due) {
    await closeSeats(db, i.id, "lapsed", now);
    await notifyOne(db, i.invitedBy, { kind: "ask_lapsed", gatheringId: i.groupId, inviteId: i.id, now });
  }
  return due.length;
}

// ── For hosts and suggesters ──────────────────────────────────────────────

/** A host's "Waiting for you": suggestions to confirm, each with how its circle is deciding. */
export async function invitesWaiting(db: DB, gatheringId: string, hostId: string, now = new Date()) {
  await requireHost(db, gatheringId, hostId);
  const rows = await db
    .select({ invite: invites, byName: user.name, byEmail: user.email })
    .from(invites)
    .innerJoin(user, eq(user.id, invites.invitedBy))
    .where(and(eq(invites.groupId, gatheringId), eq(invites.status, "nominated"), gt(invites.expiresAt, now)))
    .orderBy(desc(invites.createdAt));
  return Promise.all(rows.map(async (r) => ({
    id: r.invite.id, name: r.invite.name, email: r.invite.email, note: r.invite.note,
    createdAt: r.invite.createdAt, expiresAt: r.invite.expiresAt,
    by: displayName({ name: r.byName, email: r.byEmail }),
    seat: await seatState(db, r.invite.id),
  })));
}

/** Your suggestions still waiting on a host. */
export async function mySuggestions(db: DB, gatheringId: string, userId: string, now = new Date()) {
  const rows = await db
    .select()
    .from(invites)
    .where(and(eq(invites.groupId, gatheringId), eq(invites.invitedBy, userId), eq(invites.status, "nominated"), gt(invites.expiresAt, now)))
    .orderBy(desc(invites.createdAt));
  return Promise.all(rows.map(async (i) => ({ id: i.id, name: i.name, createdAt: i.createdAt, expiresAt: i.expiresAt, seat: await seatState(db, i.id) })));
}

async function seatState(db: DB, inviteId: string) {
  const [s] = await seatsForInvite(db, inviteId);
  if (!s) return null;
  const circle = (await circleById(db, s.groupId))!;
  const [supports, seated] = await Promise.all([
    db.select({ userId: seatSupports.userId }).from(seatSupports).where(eq(seatSupports.requestId, s.id)),
    activeMemberCount(db, circle.id),
  ]);
  return { circle: circle.name, status: s.status, supports: supports.length, needed: approvalsNeeded(circle, seated) };
}

// ── The person invited ────────────────────────────────────────────────────

export type InviteView = {
  id: string;
  state: "pending" | "accepted" | "revoked" | "expired";
  email: string;
  note: string;
  gathering: { id: string; slug: string; name: string; welcomeNote: string };
  inviter: { name: string; email: string };
  /** a circle whose seat is already theirs */
  circle: { id: string; slug: string; name: string } | null;
};

export async function findInvite(db: DB, token: string, now = new Date()): Promise<InviteView | null> {
  const [row] = await db
    .select({
      invite: invites,
      gathering: { id: groups.id, slug: groups.slug, name: groups.name, welcomeNote: groups.note },
      inviter: { name: user.name, email: user.email },
    })
    .from(invites)
    .innerJoin(groups, eq(groups.id, invites.groupId))
    .innerJoin(user, eq(user.id, invites.invitedBy))
    .where(eq(invites.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;

  const [held] = await seatsForInvite(db, row.invite.id, ["admitted"]);
  let circle: InviteView["circle"] = null;
  if (held) {
    const [c] = await db.select({ id: groups.id, slug: groups.slug, name: groups.name }).from(groups).where(eq(groups.id, held.groupId)).limit(1);
    circle = c ?? null;
  }

  const s = row.invite.status;
  const state: InviteView["state"] =
    s === "pending" ? (row.invite.expiresAt <= now ? "expired" : "pending") : s === "accepted" ? "accepted" : "revoked";
  return {
    id: row.invite.id, state, email: row.invite.email, note: row.invite.note,
    gathering: row.gathering, inviter: row.inviter, circle,
  };
}

/**
 * Accept: join the gathering, then sit down in any circle that made room.
 * A circle still deciding carries on, now with them as a member asking.
 * The signed-in account must be the one the invitation was sent to — its
 * email was proven by the sign-in link.
 */
export async function acceptInvite(
  db: DB,
  { token, userId, userEmail, now = new Date() }: { token: string; userId: string; userEmail: string; now?: Date },
): Promise<{ gatheringSlug: string; circleSlug: string | null; joinedCircle: boolean }> {
  const view = (await findInvite(db, token, now)) ?? refuse("That invitation link isn't valid.");
  if (view.state === "revoked") refuse("That invitation was replaced by a newer one.");
  if (view.state === "expired") refuse("That invitation has expired. Ask for a new one.");
  if (normalizeEmail(userEmail) !== view.email) refuse(`This invitation is for ${view.email}.`);

  if (view.state === "pending") {
    await requireRoom(db, view.gathering.id);
    const invite = await inviteById(db, view.id);
    await db.transaction(async (tx) => {
      await tx
        .insert(members)
        .values({ groupId: view.gathering.id, userId, invitedBy: invite.invitedBy, joinedAt: now })
        .onConflictDoNothing();
      await tx.update(invites).set({ status: "accepted", acceptedAt: now, acceptedBy: userId }).where(eq(invites.id, invite.id));
      // A seat still being decided is now for a member like any other.
      await tx
        .update(seatRequests)
        .set({ userId, inviteId: null })
        .where(and(eq(seatRequests.inviteId, invite.id), eq(seatRequests.status, "waiting")));
    });
    await notifyOne(db, invite.invitedBy, { kind: "arrived", gatheringId: view.gathering.id, actorId: userId, inviteId: invite.id, now });
  }

  let joinedCircle = false;
  for (const seat of await seatsForInvite(db, view.id, ["admitted"])) {
    try {
      await seatInCircle(db, { circleId: seat.groupId, userId, now });
      await db.update(seatRequests).set({ userId, inviteId: null }).where(eq(seatRequests.id, seat.id));
      await notifyCircle(db, seat.groupId, { kind: "seat_admitted", gatheringId: view.gathering.id, actorId: userId, seatRequestId: seat.id, now });
      joinedCircle = true;
    } catch (e) {
      if (!(e instanceof Refusal)) throw e; // full, closed or expired: they still joined the gathering
    }
  }
  return { gatheringSlug: view.gathering.slug, circleSlug: joinedCircle ? view.circle?.slug ?? null : null, joinedCircle };
}

/** What the invitation email says: from whoever suggested them, naming a circle only if it made room. */
export async function invitationLetter(db: DB, inviteId: string) {
  const [row] = await db
    .select({
      invite: invites, byName: user.name, byEmail: user.email,
      gathering: { name: groups.name, welcomeNote: groups.note },
    })
    .from(invites)
    .innerJoin(user, eq(user.id, invites.invitedBy))
    .innerJoin(groups, eq(groups.id, invites.groupId))
    .where(eq(invites.id, inviteId))
    .limit(1);
  const [held] = await seatsForInvite(db, inviteId, ["admitted"]);
  const circle = held ? await circleById(db, held.groupId) : null;
  return {
    to: row.invite.email, from: displayName({ name: row.byName, email: row.byEmail }), note: row.invite.note,
    gathering: row.gathering, circle: circle?.name ?? null,
  };
}
