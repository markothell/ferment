// Anyone with the link (GROUPS.md §10). A root group's host makes one link
// that lets whoever holds it come straight in: no invitation, no host saying
// yes per person. Off until a host makes it; the host can pause it, open it
// again, or make a new one, and the old stops working. Room still counts: the
// gathering's cap, a circle's twelve seats. Who came in this way is recorded
// on their membership, so the host can see how far the link has travelled.

import { randomBytes } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db";
import { groups, members, user } from "@/db/schema";
import { CIRCLE_MAX, seatInCircle } from "./circles";
import { refuse } from "./errors";
import { groupById, memberCount, membershipOf, requireHost, type Group } from "./gatherings";
import { notifyHosts } from "./notifications";
import { seatsSpoken } from "./seats";

export type JoinLink = { token: string; open: boolean; arrivals: number };

export type JoinLinkView = {
  group: { id: string; slug: string; name: string; kind: Group["kind"]; welcomeNote: string };
  open: boolean;
  host: { name: string | null; email: string } | null;
};

async function rootFor(db: DB, groupId: string, userId: string): Promise<Group> {
  await requireHost(db, groupId, userId);
  const g = (await groupById(db, groupId)) ?? refuse("That gathering isn't here.");
  if (g.parentId) refuse("A circle inside a gathering is joined through the gathering.");
  return g;
}

/** The group's link, for its hosts: null until one is made. */
export async function joinLinkOf(db: DB, groupId: string): Promise<JoinLink | null> {
  const g = await groupById(db, groupId);
  if (!g?.joinToken) return null;
  const [{ n }] = await db
    .select({ n: count() })
    .from(members)
    .where(and(eq(members.groupId, groupId), eq(members.viaLink, true), isNull(members.leftAt)));
  return { token: g.joinToken, open: g.joinOpen, arrivals: n };
}

/** A host makes the link, open. Making another replaces it: the old link stops working. */
export async function makeJoinLink(db: DB, { gatheringId, userId }: { gatheringId: string; userId: string }): Promise<string> {
  const g = await rootFor(db, gatheringId, userId);
  const token = randomBytes(24).toString("base64url");
  await db.update(groups).set({ joinToken: token, joinOpen: true }).where(eq(groups.id, g.id));
  return token;
}

/** A host pauses the link, or opens it again. The link itself stays the same. */
export async function setJoinLinkOpen(db: DB, { gatheringId, userId, open }: { gatheringId: string; userId: string; open: boolean }): Promise<void> {
  const g = await rootFor(db, gatheringId, userId);
  if (!g.joinToken) refuse("There's no link yet.");
  await db.update(groups).set({ joinOpen: open }).where(eq(groups.id, g.id));
}

/** What a link leads to, for whoever holds it. Null when no group has this link. */
export async function findJoinLink(db: DB, token: string): Promise<JoinLinkView | null> {
  if (!token) return null;
  const [g] = await db.select().from(groups).where(eq(groups.joinToken, token)).limit(1);
  if (!g) return null;
  const [h] = await db
    .select({ name: user.name, email: user.email })
    .from(members)
    .innerJoin(user, eq(user.id, members.userId))
    .where(and(eq(members.groupId, g.id), eq(members.role, "host"), isNull(members.leftAt)))
    .limit(1);
  return { group: { id: g.id, slug: g.slug, name: g.name, kind: g.kind, welcomeNote: g.note }, open: g.joinOpen, host: h ?? null };
}

/**
 * Come in by the link. A gathering takes a member row; a circle on its own
 * seats them (and forms at four). Someone already in just goes through.
 */
export async function joinByLink(
  db: DB,
  { token, userId, now = new Date() }: { token: string; userId: string; now?: Date },
): Promise<{ slug: string; already: boolean }> {
  const view = (await findJoinLink(db, token)) ?? refuse("That link isn't valid.");
  const { group } = view;
  if (await membershipOf(db, group.id, userId)) return { slug: group.slug, already: true };
  if (!view.open) refuse("This link is paused. Ask the host to open it again.");

  if (group.kind === "circle") {
    if ((await seatsSpoken(db, group.id)) >= CIRCLE_MAX) refuse("This circle is full.");
    await seatInCircle(db, { circleId: group.id, userId, invited: true, now });
    await db.update(members).set({ viaLink: true }).where(and(eq(members.groupId, group.id), eq(members.userId, userId)));
  } else {
    const g = (await groupById(db, group.id))!;
    if ((await memberCount(db, group.id)) >= g.maxMembers) refuse("This gathering is full.");
    await db
      .insert(members)
      .values({ groupId: group.id, userId, joinedAt: now, viaLink: true })
      .onConflictDoUpdate({ target: [members.groupId, members.userId], set: { leftAt: null, joinedAt: now, viaLink: true } });
  }
  await notifyHosts(db, { kind: "arrived_link", gatheringId: group.id, actorId: userId, now });
  return { slug: group.slug, already: false };
}
