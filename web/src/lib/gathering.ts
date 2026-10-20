import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { gatheringBySlug, membershipOf } from "@/domain/gatherings";
import { requireUser } from "./session";

/**
 * The signed-in member and their gathering, or a 404 — someone outside a
 * gathering can't tell whether it exists. Cached per request, so a layout
 * and its page share one lookup.
 */
export const loadGathering = cache(async (slug: string) => {
  const me = await requireUser(`/g/${slug}`);
  const gathering = await gatheringBySlug(db, slug);
  if (!gathering) notFound();
  const membership = await membershipOf(db, gathering.id, me.id);
  if (!membership) notFound();
  return { me, gathering, membership, isHost: membership.role === "host" };
});
