// Notifications (PLAN §7): the moments that bring people back. A row per
// person per moment; the inbox reads them and a sweep emails them, per each
// member's choice for that community: each event, a daily digest, or never.

import { and, asc, desc, eq, inArray, isNull, lte, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DB } from "@/db";
import {
  circleMembers, circles, communities, communityMembers, invites, notifications, prompts, rounds, seatRequests, user,
} from "@/db/schema";
import { newId } from "@/lib/id";
import { displayName } from "@/lib/names";

export const KINDS = {
  round_opened: "opened",
  round_revealed: "revealed",
  circle_formed: "formed",
  suggested: "suggested",
  answered: "answered",
  asked_everyone: "asked everyone",
  invite_suggested: "suggested someone",
  invite_confirmed: "invitation sent",
  invite_declined: "not this time",
  arrived: "arrived",
  seat_requested: "asking to join",
  seat_admitted: "joined",
  seat_declined: "not this time",
  ask_lapsed: "lapsed",
  harvest_proposed: "share yours?",
  harvest_reminder: "two days left",
  harvest_up: "harvest up",
  harvest_down: "harvest down",
  harvest_lapsed: "not enough yeses",
  circle_removed: "taken down",
} as const;
export type Kind = keyof typeof KINDS;

type Moment = {
  kind: Kind; communityId: string; actorId?: string | null; circleId?: string | null; roundId?: string | null;
  inviteId?: string | null; seatRequestId?: string | null; harvestId?: string | null; detail?: string | null; now?: Date;
};

async function insertFor(db: DB, userIds: string[], m: Moment) {
  const to = [...new Set(userIds)].filter((id) => id !== m.actorId);
  if (!to.length) return;
  await db.insert(notifications).values(
    to.map((userId) => ({
      id: newId(), userId, communityId: m.communityId, kind: m.kind,
      actorId: m.actorId ?? null, circleId: m.circleId ?? null, roundId: m.roundId ?? null,
      inviteId: m.inviteId ?? null, seatRequestId: m.seatRequestId ?? null, harvestId: m.harvestId ?? null, detail: m.detail ?? null, createdAt: m.now ?? new Date(),
    })),
  );
}

/** These people, minus whoever caused the moment. */
export async function notifyPeople(db: DB, userIds: string[], m: Moment) {
  await insertFor(db, userIds, m);
}

/** Everyone active in a circle, minus whoever caused the moment. */
export async function notifyCircle(db: DB, circleId: string, m: Omit<Moment, "circleId">) {
  const members = await db
    .select({ userId: circleMembers.userId })
    .from(circleMembers)
    .where(and(eq(circleMembers.circleId, circleId), isNull(circleMembers.leftAt)));
  await insertFor(db, members.map((r) => r.userId), { ...m, circleId });
}

/** Everyone in a community, minus whoever caused the moment. */
export async function notifyCommunity(db: DB, m: Moment) {
  const members = await db.select({ userId: communityMembers.userId }).from(communityMembers).where(eq(communityMembers.communityId, m.communityId));
  await insertFor(db, members.map((r) => r.userId), m);
}

/** The community's hosts, minus whoever caused the moment. */
export async function notifyHosts(db: DB, m: Moment) {
  const hosts = await db
    .select({ userId: communityMembers.userId })
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, m.communityId), eq(communityMembers.role, "host")));
  await insertFor(db, hosts.map((r) => r.userId), m);
}

/** One person. Skipped if they already have the same unread, unsent moment waiting. */
export async function notifyOne(db: DB, userId: string, m: Moment) {
  if (userId === m.actorId) return;
  const [waiting] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId), eq(notifications.kind, m.kind),
      m.roundId ? eq(notifications.roundId, m.roundId) : isNull(notifications.roundId),
      m.inviteId ? eq(notifications.inviteId, m.inviteId) : isNull(notifications.inviteId),
      m.seatRequestId ? eq(notifications.seatRequestId, m.seatRequestId) : isNull(notifications.seatRequestId),
      m.harvestId ? eq(notifications.harvestId, m.harvestId) : isNull(notifications.harvestId),
      isNull(notifications.readAt), isNull(notifications.emailedAt),
    ))
    .limit(1);
  if (!waiting) await insertFor(db, [userId], m);
}

// ── Reading ───────────────────────────────────────────────────────────────

export type NotificationView = {
  id: string; kind: Kind; createdAt: Date; readAt: Date | null; emailedAt: Date | null;
  communityId: string; communityName: string; text: string; href: string;
};

function describe(r: {
  kind: string; actorName: string | null; actorEmail: string | null; circleName: string | null; question: string | null; communityName: string;
  detail: string | null;
  /** invitations and seats: who it's for, whether that's the reader, and a host's note */
  subject: string | null; forReader: boolean; selfAsked: boolean; hostNote: string | null;
}): string {
  const who = r.actorEmail ? displayName({ name: r.actorName, email: r.actorEmail }) : "Someone";
  const q = r.question ? `“${r.question}”` : "a question";
  const them = r.subject || "them";
  switch (r.kind as Kind) {
    case "invite_suggested": return `${who} suggests inviting ${them}.`;
    case "invite_confirmed": return `Your invitation to ${them} went out.`;
    case "invite_declined": return r.hostNote ? `Not this time for ${them}: “${r.hostNote}”` : `Not this time for ${them}.`;
    case "arrived": return `${who} arrived. You invited them.`;
    case "seat_requested": return r.selfAsked ? `${them} asks to join ${r.circleName}.` : `${who} suggests ${them} for ${r.circleName}.`;
    case "seat_admitted": return r.forReader ? `You're in ${r.circleName}.` : `${them} joined ${r.circleName}.`;
    case "seat_declined": return r.forReader ? `${r.circleName} couldn't make room this time.` : `Not this time for ${them} in ${r.circleName}.`;
    case "ask_lapsed":
      return r.circleName
        ? (r.selfAsked ? `Your ask to join ${r.circleName} lapsed after 14 days.` : `Your suggestion of ${them} for ${r.circleName} lapsed after 14 days.`)
        : `Your suggestion of ${them} lapsed after 14 days.`;
    case "round_opened": return `${q} is open in ${r.circleName}.`;
    case "round_revealed": return `Everyone's answers to ${q} are in, in ${r.circleName}.`;
    case "circle_formed": return `${r.circleName} has four people and has begun.`;
    case "suggested": return `${who} suggested ${q} to ${r.circleName}. It needs support to open.`;
    case "answered": return `${who} answered your question ${q}.`;
    case "asked_everyone": return `${who} asked everyone ${q}.`;
    case "harvest_proposed": return `${who} wants to open ${q} to ${r.communityName}. Share yours?`;
    case "harvest_reminder": return `Two days left to share yours from ${q}.`;
    case "harvest_up": return `${r.circleName}'s answers to ${q} are open to ${r.communityName}.`;
    case "harvest_down": return `${r.circleName}'s harvest of ${q} came down: fewer than 3 are sharing now.`;
    case "harvest_lapsed": return `Not enough yeses to open ${q}. Nothing was shared.`;
    case "circle_removed": return `${who} took down ${r.detail ?? "a circle"} before it began.`;
    default: return "Something happened.";
  }
}

const candidate = alias(user, "candidate");
const seatInvite = alias(invites, "seat_invite");

export async function listNotifications(db: DB, where: { userId: string; ids?: string[]; limit?: number }): Promise<NotificationView[]> {
  const rows = await db
    .select({
      inviteName: invites.name, hostNote: invites.hostNote,
      seatUserId: seatRequests.userId, seatAskedBy: seatRequests.askedBy,
      candidateName: candidate.name, candidateEmail: candidate.email, seatInviteName: seatInvite.name,
      id: notifications.id, kind: notifications.kind, createdAt: notifications.createdAt, readAt: notifications.readAt,
      emailedAt: notifications.emailedAt, communityId: notifications.communityId,
      communityName: communities.name, communitySlug: communities.slug,
      actorName: user.name, actorEmail: user.email,
      circleName: circles.name, circleSlug: circles.slug, roundId: notifications.roundId, question: prompts.question,
      harvestId: notifications.harvestId, detail: notifications.detail,
    })
    .from(notifications)
    .innerJoin(communities, eq(communities.id, notifications.communityId))
    .leftJoin(user, eq(user.id, notifications.actorId))
    .leftJoin(circles, eq(circles.id, notifications.circleId))
    .leftJoin(rounds, eq(rounds.id, notifications.roundId))
    .leftJoin(prompts, eq(prompts.id, rounds.promptId))
    .leftJoin(invites, eq(invites.id, notifications.inviteId))
    .leftJoin(seatRequests, eq(seatRequests.id, notifications.seatRequestId))
    .leftJoin(candidate, eq(candidate.id, seatRequests.userId))
    .leftJoin(seatInvite, eq(seatInvite.id, seatRequests.inviteId))
    .where(and(eq(notifications.userId, where.userId), where.ids ? inArray(notifications.id, where.ids) : undefined))
    .orderBy(desc(notifications.createdAt))
    .limit(where.limit ?? 100);
  return rows.map((r) => ({
    id: r.id, kind: r.kind as Kind, createdAt: r.createdAt, readAt: r.readAt, emailedAt: r.emailedAt,
    communityId: r.communityId, communityName: r.communityName,
    text: describe({
      ...r,
      subject: r.inviteName
        || (r.candidateEmail ? displayName({ name: r.candidateName, email: r.candidateEmail }) : null)
        || r.seatInviteName,
      forReader: r.seatUserId === where.userId,
      selfAsked: r.seatUserId !== null && r.seatUserId === r.seatAskedBy,
    }),
    href: r.kind === "harvest_up" && r.harvestId ? `/c/${r.communitySlug}/h/${r.harvestId}`
      : r.roundId ? `/c/${r.communitySlug}/r/${r.roundId}`
      : r.circleSlug ? `/c/${r.communitySlug}/circles/${r.circleSlug}`
      : r.kind === "invite_suggested" ? `/c/${r.communitySlug}/people#waiting`
      : `/c/${r.communitySlug}`,
  }));
}

export async function unreadCount(db: DB, userId: string): Promise<number> {
  const rows = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows.length;
}

export async function markAllRead(db: DB, userId: string, now = new Date()) {
  await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

// ── Email ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/**
 * What's due to be emailed now, one batch per person per community:
 *   each   → everything not yet sent (a sweep gathers a burst into one email);
 *   digest → everything not yet sent, once the oldest has waited a day;
 *   off    → nothing is sent; those rows are marked handled.
 * Already-read notifications are never emailed.
 */
export async function dueEmails(db: DB, now = new Date()) {
  const pending = await db
    .select({
      id: notifications.id, userId: notifications.userId, communityId: notifications.communityId,
      createdAt: notifications.createdAt, pref: communityMembers.email, email: user.email, name: user.name,
    })
    .from(notifications)
    .innerJoin(communityMembers, and(eq(communityMembers.communityId, notifications.communityId), eq(communityMembers.userId, notifications.userId)))
    .innerJoin(user, eq(user.id, notifications.userId))
    .where(and(isNull(notifications.emailedAt), isNull(notifications.readAt), lte(notifications.createdAt, now)))
    .orderBy(asc(notifications.createdAt));

  const off = pending.filter((p) => p.pref === "off").map((p) => p.id);
  if (off.length) await db.update(notifications).set({ emailedAt: now }).where(inArray(notifications.id, off));

  const batches = new Map<string, { userId: string; communityId: string; email: string; name: string; ids: string[]; oldest: Date; pref: string }>();
  for (const p of pending) {
    if (p.pref === "off") continue;
    const key = `${p.userId}:${p.communityId}`;
    const b = batches.get(key) ?? { userId: p.userId, communityId: p.communityId, email: p.email, name: p.name, ids: [], oldest: p.createdAt, pref: p.pref };
    b.ids.push(p.id);
    batches.set(key, b);
  }
  return [...batches.values()].filter((b) => b.pref === "each" || now.getTime() - b.oldest.getTime() >= DAY_MS);
}

export async function markEmailed(db: DB, ids: string[], now = new Date()) {
  if (ids.length) await db.update(notifications).set({ emailedAt: now }).where(inArray(notifications.id, ids));
}

export async function setEmailPref(db: DB, { communityId, userId, pref }: { communityId: string; userId: string; pref: "each" | "digest" | "off" }) {
  await db
    .update(communityMembers)
    .set({ email: pref })
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId), ne(communityMembers.email, pref)));
}
