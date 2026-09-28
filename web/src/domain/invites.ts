// Invitations come from a person and can name a circle (PLAN §4). Any member
// can invite. Only the token's hash is stored; the token lives in the email.

import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import type { DB } from "@/db";
import { circles, communities, communityMembers, invites, user } from "@/db/schema";
import { normalizeEmail } from "@/lib/access";
import { newId } from "@/lib/id";
import { isCircleMember, joinCircle } from "./circles";
import { memberCount, requireMember } from "./communities";
import { Refusal, refuse } from "./errors";

const INVITE_DAYS = 30;
const NOTE_MAX = 500;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvite(
  db: DB,
  {
    communityId, invitedBy, email, circleId = null, note = "", now = new Date(),
  }: { communityId: string; invitedBy: string; email: string; circleId?: string | null; note?: string; now?: Date },
): Promise<{ inviteId: string; token: string; email: string }> {
  await requireMember(db, communityId, invitedBy);
  const parsed = z.email().safeParse(email.trim());
  if (!parsed.success) refuse("That doesn't look like an email address.");
  const to = normalizeEmail(parsed.data);
  if (note.trim().length > NOTE_MAX) refuse("That note is too long.");

  const [already] = await db
    .select({ userId: communityMembers.userId })
    .from(communityMembers)
    .innerJoin(user, eq(user.id, communityMembers.userId))
    .where(and(eq(communityMembers.communityId, communityId), eq(user.email, to)))
    .limit(1);
  if (already) refuse("They're already in this community.");

  const [community] = await db.select().from(communities).where(eq(communities.id, communityId)).limit(1);
  if ((await memberCount(db, communityId)) >= community.maxMembers) refuse("This community is full.");

  if (circleId) {
    const [circle] = await db.select().from(circles).where(eq(circles.id, circleId)).limit(1);
    if (!circle || circle.communityId !== communityId) refuse("That circle isn't in this community.");
    if (!(await isCircleMember(db, circleId, invitedBy))) refuse("You can only invite people to circles you're in.");
  }

  const token = randomBytes(32).toString("base64url");
  const inviteId = newId();
  await db.transaction(async (tx) => {
    // One live invitation per person per community: a new one replaces the old.
    await tx
      .update(invites)
      .set({ status: "revoked" })
      .where(and(eq(invites.communityId, communityId), eq(invites.email, to), eq(invites.status, "pending")));
    await tx.insert(invites).values({
      id: inviteId, communityId, email: to, invitedBy, circleId, note: note.trim(),
      tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000),
    });
  });
  return { inviteId, token, email: to };
}

export type InviteView = {
  id: string;
  state: "pending" | "accepted" | "revoked" | "expired";
  email: string;
  note: string;
  community: { id: string; slug: string; name: string; welcomeNote: string };
  inviter: { name: string; email: string };
  circle: { id: string; slug: string; name: string } | null;
};

export async function findInvite(db: DB, token: string, now = new Date()): Promise<InviteView | null> {
  const [row] = await db
    .select({
      invite: invites,
      community: { id: communities.id, slug: communities.slug, name: communities.name, welcomeNote: communities.welcomeNote },
      inviter: { name: user.name, email: user.email },
    })
    .from(invites)
    .innerJoin(communities, eq(communities.id, invites.communityId))
    .innerJoin(user, eq(user.id, invites.invitedBy))
    .where(eq(invites.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;

  let circle: InviteView["circle"] = null;
  if (row.invite.circleId) {
    const [c] = await db
      .select({ id: circles.id, slug: circles.slug, name: circles.name })
      .from(circles)
      .where(eq(circles.id, row.invite.circleId))
      .limit(1);
    circle = c ?? null;
  }

  const expired = row.invite.status === "pending" && row.invite.expiresAt <= now;
  return {
    id: row.invite.id,
    state: expired ? "expired" : row.invite.status,
    email: row.invite.email,
    note: row.invite.note,
    community: row.community,
    inviter: row.inviter,
    circle,
  };
}

/**
 * Accept: join the community, and the named circle if it still has room.
 * The signed-in account must be the one the invitation was sent to — its
 * email was proven by the sign-in link.
 */
export async function acceptInvite(
  db: DB,
  { token, userId, userEmail, now = new Date() }: { token: string; userId: string; userEmail: string; now?: Date },
): Promise<{ communitySlug: string; circleSlug: string | null; joinedCircle: boolean }> {
  const view = (await findInvite(db, token, now)) ?? refuse("That invitation link isn't valid.");
  if (view.state === "revoked") refuse("That invitation was replaced by a newer one.");
  if (view.state === "expired") refuse("That invitation has expired. Ask for a new one.");
  if (normalizeEmail(userEmail) !== view.email) refuse(`This invitation is for ${view.email}.`);

  if (view.state === "pending") {
    const [community] = await db.select().from(communities).where(eq(communities.id, view.community.id)).limit(1);
    if ((await memberCount(db, community.id)) >= community.maxMembers) refuse("This community is full.");

    const [invite] = await db.select().from(invites).where(eq(invites.id, view.id)).limit(1);
    await db.transaction(async (tx) => {
      await tx
        .insert(communityMembers)
        .values({ communityId: community.id, userId, invitedBy: invite.invitedBy, joinedAt: now })
        .onConflictDoNothing();
      await tx.update(invites).set({ status: "accepted", acceptedAt: now, acceptedBy: userId }).where(eq(invites.id, invite.id));
    });
  }

  let joinedCircle = false;
  if (view.circle) {
    try {
      await joinCircle(db, { circleId: view.circle.id, userId, now });
      joinedCircle = true;
    } catch (e) {
      if (!(e instanceof Refusal)) throw e; // full, closed or expired: they still joined the community
    }
  }
  return { communitySlug: view.community.slug, circleSlug: view.circle?.slug ?? null, joinedCircle };
}
