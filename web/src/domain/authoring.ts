// Editing and deleting what you made, before it's taken hold (PLAN §11,
// "Editing and deleting what you made"). Only the author, for now. Deleting is
// for real: the rows go, and a question nothing else uses goes with them.
//
//   edit a question:   until someone else has answered it, picked it, or adapted it
//   delete a round:    a circle suggestion until it opens; an open question
//                      until someone else answers. Never the welcome question.
//   delete a circle:   its creator, until it has formed and has a question
//                      queued or open; a forming one can go whatever it holds.

import { and, count, eq, inArray, isNull, isNotNull, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { circleMembers, circles, harvests, invites, prompts, responses, rounds, seatRequests } from "@/db/schema";
import { circleById, type Circle } from "./circles";
import { refuse } from "./errors";
import { notifyPeople } from "./notifications";
import { cleanWording, promptById } from "./prompts";
import { roundById, type Round } from "./rounds";

const some = async (q: Promise<{ n: number }[]>) => (await q)[0].n > 0;

/** Has anyone but its author taken this question up: answered it, run it, adapted it, or started a circle on it? */
async function takenUp(db: DB, promptId: string, authorId: string): Promise<boolean> {
  const checks = await Promise.all([
    some(db.select({ n: count() }).from(responses).innerJoin(rounds, eq(responses.roundId, rounds.id))
      .where(and(eq(rounds.promptId, promptId), ne(responses.userId, authorId)))),
    some(db.select({ n: count() }).from(rounds).where(and(eq(rounds.promptId, promptId), ne(rounds.authorId, authorId)))),
    some(db.select({ n: count() }).from(prompts).where(eq(prompts.adaptedFromId, promptId))),
    some(db.select({ n: count() }).from(circles).where(and(eq(circles.originPromptId, promptId), ne(circles.proposedBy, authorId)))),
    some(db.select({ n: count() }).from(harvests).where(eq(harvests.promptId, promptId))),
  ]);
  return checks.some(Boolean);
}

/** Why this person can't edit the round's question, or null if they can. */
async function editBlock(db: DB, round: Round, userId: string): Promise<string | null> {
  if (round.welcome) return "The welcome question is changed in setup.";
  const prompt = (await promptById(db, round.promptId))!;
  if (prompt.authorId !== userId) return "Only whoever wrote the question can edit it.";
  if (await takenUp(db, prompt.id, userId)) return "Someone else has taken this question up, so it stays as it is.";
  return null;
}

/** Why this person can't delete the round, or null if they can. */
async function deleteBlock(db: DB, round: Round, userId: string): Promise<string | null> {
  if (round.welcome) return "The welcome question can be changed but not deleted.";
  if (round.authorId !== userId) return "Only whoever asked it can delete it.";
  if (round.circleId) {
    return round.phase === "nominated" || round.phase === "queued" || round.phase === "skipped" ? null : "It has already opened in the circle.";
  }
  const others = await some(db.select({ n: count() }).from(responses).where(and(eq(responses.roundId, round.id), ne(responses.userId, userId))));
  return others ? "Someone has answered, so it stays." : null;
}

/** What the round's author may still do to it. */
export async function authorRights(db: DB, round: Round, userId: string): Promise<{ edit: boolean; delete: boolean }> {
  if (round.authorId !== userId) return { edit: false, delete: false };
  const [edit, del] = await Promise.all([editBlock(db, round, userId), deleteBlock(db, round, userId)]);
  return { edit: edit === null, delete: del === null };
}

/** Fix a question's wording. It changes everywhere the question is used, which is only ever its author's own rounds. */
export async function editQuestion(
  db: DB,
  { roundId, userId, question, context }: { roundId: string; userId: string; question: string; context: string },
): Promise<void> {
  const round = (await roundById(db, roundId)) ?? refuse("That question doesn't exist.");
  const blocked = await editBlock(db, round, userId);
  if (blocked) refuse(blocked);
  await db.update(prompts).set(cleanWording({ question, context })).where(eq(prompts.id, round.promptId));
}

/** Delete a round for good, and its question if nothing else uses it. */
export async function deleteRound(db: DB, { roundId, userId }: { roundId: string; userId: string }): Promise<void> {
  const round = (await roundById(db, roundId)) ?? refuse("That question doesn't exist.");
  const blocked = await deleteBlock(db, round, userId);
  if (blocked) refuse(blocked);
  await db.transaction(async (tx) => {
    await tx.delete(rounds).where(eq(rounds.id, round.id));
    await pruneQuestion(tx, round.promptId);
  });
}

/** Delete a question once no round, adaptation, circle or harvest refers to it. */
export async function pruneQuestion(db: DB, promptId: string): Promise<void> {
  const uses = await Promise.all([
    some(db.select({ n: count() }).from(rounds).where(eq(rounds.promptId, promptId))),
    some(db.select({ n: count() }).from(prompts).where(eq(prompts.adaptedFromId, promptId))),
    some(db.select({ n: count() }).from(circles).where(eq(circles.originPromptId, promptId))),
    some(db.select({ n: count() }).from(harvests).where(eq(harvests.promptId, promptId))),
  ]);
  if (!uses.some(Boolean)) await db.delete(prompts).where(eq(prompts.id, promptId));
}

// ── Circles ───────────────────────────────────────────────────────────────

/** Why this person can't delete the circle, or null if they can. */
async function circleBlock(db: DB, circle: Circle, userId: string): Promise<string | null> {
  if (circle.proposedBy !== userId) return "Only whoever started the circle can delete it.";
  if (circle.status === "closed") return "This circle has closed.";
  if (circle.status === "forming" || circle.status === "expired") return null;
  const begun = await some(db.select({ n: count() }).from(rounds)
    .where(and(eq(rounds.circleId, circle.id), inArray(rounds.phase, ["queued", "open", "closed"]))));
  return begun ? "It has begun, so it stays." : null;
}

export async function mayDeleteCircle(db: DB, circle: Circle, userId: string): Promise<boolean> {
  return (await circleBlock(db, circle, userId)) === null;
}

/**
 * Delete a circle that hasn't begun, and everything in it. Anyone who'd joined
 * is told by name. Suggested invitations made for a seat in it are withdrawn;
 * one already sent still lets them into the community, just without the seat.
 */
export async function deleteCircle(db: DB, { circleId, userId, now = new Date() }: { circleId: string; userId: string; now?: Date }): Promise<void> {
  const circle = (await circleById(db, circleId)) ?? refuse("That circle doesn't exist.");
  const blocked = await circleBlock(db, circle, userId);
  if (blocked) refuse(blocked);
  await db.transaction(async (tx) => {
    const joined = await tx.select({ userId: circleMembers.userId }).from(circleMembers)
      .where(and(eq(circleMembers.circleId, circle.id), isNull(circleMembers.leftAt)));
    const held = await tx.select({ inviteId: seatRequests.inviteId }).from(seatRequests)
      .where(and(eq(seatRequests.circleId, circle.id), isNotNull(seatRequests.inviteId)));
    const inviteIds = held.map((h) => h.inviteId!);
    if (inviteIds.length) {
      await tx.update(invites).set({ status: "revoked" }).where(and(inArray(invites.id, inviteIds), eq(invites.status, "nominated")));
    }
    const asked = await tx.select({ promptId: rounds.promptId }).from(rounds).where(eq(rounds.circleId, circle.id));
    await tx.delete(circles).where(eq(circles.id, circle.id));
    const promptIds = new Set([...asked.map((r) => r.promptId), ...(circle.originPromptId ? [circle.originPromptId] : [])]);
    for (const id of promptIds) await pruneQuestion(tx, id);
    await notifyPeople(tx, joined.map((j) => j.userId), {
      kind: "circle_removed", communityId: circle.communityId, actorId: userId, detail: circle.name, now,
    });
  });
}
