// What the community reads of a harvest. This file imports only the copy
// (harvests, harvest_items) and the circle's name, never responses: the read
// side can't reach a private answer even by mistake (08 PROTOCOLS §5).
// Only harvests that are up, with at least three answers still in, show.

import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { circles, harvestItems, harvests } from "@/db/schema";

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
  return { ...h, items };
}
