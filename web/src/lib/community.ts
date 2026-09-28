import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { communityBySlug, membershipOf } from "@/domain/communities";
import { requireUser } from "./session";

/**
 * The signed-in member and their community, or a 404 — someone outside a
 * community can't tell whether it exists. Cached per request, so a layout
 * and its page share one lookup.
 */
export const loadCommunity = cache(async (slug: string) => {
  const me = await requireUser(`/c/${slug}`);
  const community = await communityBySlug(db, slug);
  if (!community) notFound();
  const membership = await membershipOf(db, community.id, me.id);
  if (!membership) notFound();
  return { me, community, membership, isHost: membership.role === "host" };
});
