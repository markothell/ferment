import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { groupBySlug, groupById, membershipOf, type Group } from "@/domain/gatherings";
import { requireUser } from "./session";

/**
 * The signed-in member, the group at this address and its root, or a 404:
 * someone outside a gathering can't tell whether it exists. Every group lives
 * at /g/<slug> (GROUPS.md §7); a circle inside a gathering is read as a member
 * of the gathering. `gathering` is the root, which the pages under the
 * address belong to. Cached per request, so a layout and its page share one lookup.
 */
export const loadGroup = cache(async (slug: string) => {
  const me = await requireUser(`/g/${slug}`);
  const group = await groupBySlug(db, slug);
  if (!group) notFound();
  const root: Group | null = group.parentId ? await groupById(db, group.rootId) : group;
  if (!root) notFound();
  const membership = await membershipOf(db, root.id, me.id);
  if (!membership) notFound();
  return { me, group, gathering: root, membership, isHost: membership.role === "host" };
});
