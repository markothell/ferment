// What the community reads of a harvest. This file imports only the copy
// (harvests, harvest_items) and the circle's name, never responses: the read
// side can't reach a private answer even by mistake (08 PROTOCOLS §5).
// Only harvests that are up, with at least three answers still in, show.

import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { circles, communityMembers, harvestItems, harvests } from "@/db/schema";
import { listenPath } from "@/lib/audioStore";

const MIN = 3; // HARVEST_MIN in harvests.ts; repeated so this file imports nothing from the write side.

const card = {
  id: harvests.id, question: harvests.question, shape: harvests.shape, answered: harvests.answered, upAt: harvests.upAt,
  promptId: harvests.promptId, circleName: circles.name, circleSlug: circles.slug, circleColor: circles.color,
  shared: count(harvestItems.userId),
};

/** Harvests that are up, as cards: for a circle, or across the community for the feed. */
async function cards(db: DB, where: { communityId: string; circleId?: string }) {
  return db
    .select(card)
    .from(harvests)
    .innerJoin(circles, eq(circles.id, harvests.circleId))
    .innerJoin(harvestItems, eq(harvestItems.harvestId, harvests.id))
    .where(and(
      eq(harvests.communityId, where.communityId), eq(harvests.status, "up"),
      where.circleId ? eq(harvests.circleId, where.circleId) : undefined,
    ))
    .groupBy(harvests.id, circles.id)
    .having(({ shared }) => gte(shared, MIN))
    .orderBy(desc(harvests.upAt));
}

export type HarvestCard = Awaited<ReturnType<typeof cards>>[number];

export function circleHarvests(db: DB, communityId: string, circleId: string) {
  return cards(db, { communityId, circleId });
}

/** For the feed: each question's harvests, by prompt id. */
export async function harvestsByPrompt(db: DB, communityId: string): Promise<Map<string, HarvestCard[]>> {
  const by = new Map<string, HarvestCard[]>();
  for (const c of await cards(db, { communityId })) {
    if (c.promptId) by.set(c.promptId, [...(by.get(c.promptId) ?? []), c]);
  }
  return by;
}

/** One harvest with what was shared in it, or null if it isn't up. */
export async function readHarvest(db: DB, communityId: string, harvestId: string) {
  const [h] = await db
    .select({ ...card, axes: harvests.axes, circleId: harvests.circleId })
    .from(harvests)
    .innerJoin(circles, eq(circles.id, harvests.circleId))
    .innerJoin(harvestItems, eq(harvestItems.harvestId, harvests.id))
    .where(and(eq(harvests.id, harvestId), eq(harvests.communityId, communityId), eq(harvests.status, "up")))
    .groupBy(harvests.id, circles.id)
    .having(({ shared }) => gte(shared, MIN));
  if (!h) return null;
  const items = await db
    .select({
      userId: harvestItems.userId, name: harvestItems.name, text: harvestItems.text, transcript: harvestItems.transcript,
      audioUrl: harvestItems.audioUrl, audioSeconds: harvestItems.audioSeconds, x: harvestItems.x, y: harvestItems.y, words: harvestItems.words,
    })
    .from(harvestItems)
    .where(inArray(harvestItems.harvestId, [h.id]))
    .orderBy(asc(harvestItems.sharedAt));
  return { ...h, items: items.map((i) => ({ ...i, audioUrl: i.audioUrl && listenPath.harvest(h.id, i.userId) })) };
}

/**
 * The stored recording behind one shared answer, for /api/listen, or null if
 * the viewer may not hear it: the harvest must be up, the answer still in it,
 * and the viewer in its community.
 */
export async function harvestAudio(db: DB, harvestId: string, userId: string, viewerId: string): Promise<string | null> {
  const [h] = await db.select({ communityId: harvests.communityId }).from(harvests).where(eq(harvests.id, harvestId)).limit(1);
  if (!h) return null;
  const [member] = await db
    .select({ userId: communityMembers.userId })
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, h.communityId), eq(communityMembers.userId, viewerId)))
    .limit(1);
  if (!member || !(await readHarvest(db, h.communityId, harvestId))) return null;
  const [item] = await db
    .select({ audioUrl: harvestItems.audioUrl })
    .from(harvestItems)
    .where(and(eq(harvestItems.harvestId, harvestId), eq(harvestItems.userId, userId)))
    .limit(1);
  return item?.audioUrl ?? null;
}
