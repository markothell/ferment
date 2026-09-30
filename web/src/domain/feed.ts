// "What we're talking about" (PLAN §2; design/ferment/previews/community.html):
// the questions this community has actually asked, each with how far it has
// spread. Adoption by independent circles is the only ranking: a question
// counts every distinct circle that ran it or an adaptation of it.
//
// `beyond` (other communities that took it up) and `arrived` (it started in
// another community) are the platform-level spread from the essays. Nothing
// crosses communities yet, so they are 0 and false; the shape is ready.
//
// Replies (domain/replies.ts) aren't questions of their own here: each is
// listed under the question at the root of its chain, and never counts
// toward that question's spread.

import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "@/db";
import { circleMembers, circles, prompts, responses, rounds, user } from "@/db/schema";
import { displayName } from "@/lib/names";

export type FeedItem = Awaited<ReturnType<typeof feed>>[number];

export async function feed(db: DB, communityId: string, viewerId: string) {
  const [promptRows, runRows, circleRows, mine, answered] = await Promise.all([
    db
      .select({
        id: prompts.id, question: prompts.question, context: prompts.context, shape: prompts.shape, reveal: prompts.reveal,
        adaptedFromId: prompts.adaptedFromId, createdAt: prompts.createdAt, authorName: user.name, authorEmail: user.email,
      })
      .from(prompts)
      .innerJoin(user, eq(user.id, prompts.authorId))
      .where(eq(prompts.communityId, communityId)),
    db
      .select({
        id: rounds.id, promptId: rounds.promptId, circleId: rounds.circleId, phase: rounds.phase, openedAt: rounds.openedAt, closedAt: rounds.closedAt,
        replyToRoundId: rounds.replyToRoundId,
      })
      .from(rounds)
      .where(and(eq(rounds.communityId, communityId), inArray(rounds.phase, ["open", "closed", "nominated", "queued"]))),
    db.select({ id: circles.id, slug: circles.slug, name: circles.name, status: circles.status }).from(circles).where(eq(circles.communityId, communityId)),
    db
      .select({ circleId: circleMembers.circleId })
      .from(circleMembers)
      .innerJoin(circles, eq(circles.id, circleMembers.circleId))
      .where(and(eq(circles.communityId, communityId), eq(circleMembers.userId, viewerId), isNull(circleMembers.leftAt))),
    db
      .select({ roundId: responses.roundId })
      .from(responses)
      .innerJoin(rounds, eq(rounds.id, responses.roundId))
      .where(and(eq(rounds.communityId, communityId), isNull(rounds.circleId))),
  ]);

  const circleById = new Map(circleRows.map((c) => [c.id, c]));
  const total = Math.max(1, circleRows.filter((c) => c.status === "active" || c.status === "idle").length);
  const runById = new Map(runRows.map((r) => [r.id, r]));
  const happened = runRows.filter((r) => r.phase === "open" || r.phase === "closed");
  const ran = happened.filter((r) => !r.replyToRoundId);
  // Each reply that has opened, under the question its chain started from.
  const rootOf = (id: string): string | null => {
    const seen = new Set<string>();
    for (let r = runById.get(id); r && !seen.has(r.id); r = r.replyToRoundId ? runById.get(r.replyToRoundId) : undefined) {
      seen.add(r.id);
      if (!r.replyToRoundId) return r.promptId;
    }
    return null;
  };
  const repliesUnder = new Map<string, typeof happened>();
  for (const r of happened) {
    if (!r.replyToRoundId) continue;
    const root = rootOf(r.id);
    if (root) repliesUnder.set(root, [...(repliesUnder.get(root) ?? []), r]);
  }
  const promptById = new Map(promptRows.map((p) => [p.id, p]));
  const children = new Map<string, string[]>();
  for (const p of promptRows) if (p.adaptedFromId) children.set(p.adaptedFromId, [...(children.get(p.adaptedFromId) ?? []), p.id]);
  const family = (id: string): string[] => [id, ...(children.get(id) ?? []).flatMap(family)];
  const myCircles = mine.map((m) => m.circleId).filter((id) => {
    const c = circleById.get(id);
    return c && c.status !== "closed" && c.status !== "expired";
  });

  const items = promptRows
    .filter((p) => ran.some((r) => r.promptId === p.id))
    .map((p) => {
      const fam = family(p.id);
      const runs = ran.filter((r) => fam.includes(r.promptId)).sort((a, b) => (a.openedAt?.getTime() ?? 0) - (b.openedAt?.getTime() ?? 0));

      // Distinct circles, in the order they took it up.
      const byCircle = new Map<string, { open: boolean; first: Date | null; viaAdaptation: boolean }>();
      for (const r of runs) {
        if (!r.circleId) continue;
        const seen = byCircle.get(r.circleId);
        byCircle.set(r.circleId, {
          open: (seen?.open ?? false) || r.phase === "open",
          first: seen?.first ?? r.openedAt,
          viaAdaptation: (seen?.viaAdaptation ?? true) && r.promptId !== p.id,
        });
      }
      const circlesTookIt = [...byCircle].map(([id, v]) => ({ id, slug: circleById.get(id)!.slug, name: circleById.get(id)!.name, ...v }));

      const everyoneRound = runs.find((r) => !r.circleId && r.promptId === p.id);
      const everyone = everyoneRound
        ? { roundId: everyoneRound.id, open: everyoneRound.phase === "open", answered: answered.filter((a) => a.roundId === everyoneRound.id).length }
        : null;

      const first = runs[0];
      const waitingOrOpen = new Set(
        runRows.filter((r) => r.promptId === p.id && r.circleId && ["nominated", "queued", "open"].includes(r.phase)).map((r) => r.circleId),
      );
      const parent = p.adaptedFromId ? promptById.get(p.adaptedFromId) : null;

      return {
        promptId: p.id,
        question: p.question,
        context: p.context,
        author: displayName({ name: p.authorName, email: p.authorEmail }),
        adaptedFrom: parent ? { id: parent.id, question: parent.question } : null,
        adaptations: (children.get(p.id) ?? []).map((id) => ({ id, question: promptById.get(id)!.question })),
        replies: (repliesUnder.get(p.id) ?? [])
          .sort((a, b) => (a.openedAt?.getTime() ?? 0) - (b.openedAt?.getTime() ?? 0))
          .map((r) => ({
            roundId: r.id, question: promptById.get(r.promptId)?.question ?? "", open: r.phase === "open",
            circle: r.circleId ? { slug: circleById.get(r.circleId)!.slug, name: circleById.get(r.circleId)!.name } : null,
          })),
        circles: circlesTookIt,
        here: everyone ? total : circlesTookIt.length,
        total,
        everyone,
        openIn: circlesTookIt.filter((c) => c.open).length,
        startedIn: first?.circleId ? { name: circleById.get(first.circleId)!.name, slug: circleById.get(first.circleId)!.slug } : null,
        startedAt: first?.openedAt ?? p.createdAt,
        lastActivity: new Date(Math.max(...runs.map((r) => (r.closedAt ?? r.openedAt ?? p.createdAt).getTime()))),
        beyond: 0,
        arrived: false,
        suggestable: myCircles
          .filter((id) => !waitingOrOpen.has(id))
          .map((id) => ({ id, name: circleById.get(id)!.name })),
      };
    });

  return items.sort((a, b) => b.here - a.here || b.lastActivity.getTime() - a.lastActivity.getTime());
}
