// Replies (design/ferment/archive/replies.html): a follow-up round the whole
// circle takes a turn on, answering an earlier round and optionally pointing
// at one person's answer in it. A reply is an ordinary round in every other
// way — support, queue, reveal, answers — and lives on its parent's branch of
// the circle map instead of the spiral. It needs less support (rounds.ts,
// approvalsNeeded) because the circle already took up what it answers.

import { and, asc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { prompts, responses, rounds, user } from "@/db/schema";
import { listenPath } from "@/lib/audioStore";
import { displayName } from "@/lib/names";
import { refuse } from "./errors";
import { promptById, type PromptInput } from "./prompts";
import { roundById, roundView, suggestRound, visibility, type Round } from "./rounds";

type Settings = Omit<Parameters<typeof suggestRound>[1], "circleId" | "userId" | "prompt" | "suggestedFromRoundId" | "replyToRoundId" | "replyToResponseId" | "now">;

/**
 * Suggest a reply to a round. The round must be in a circle and have happened
 * (open or closed), and you must be able to see its answers: a sealed round
 * takes replies once it closes. An answer you point at must be one you can see.
 */
export async function suggestReply(
  db: DB,
  {
    roundId, userId, prompt, responseId = null, now = new Date(), ...rest
  }: { roundId: string; userId: string; prompt: PromptInput | { promptId: string }; responseId?: string | null; now?: Date } & Settings,
): Promise<Round> {
  const parent = (await roundById(db, roundId)) ?? refuse("That question doesn't exist.");
  if (!parent.circleId) refuse("Open questions don't take replies yet.");
  if (parent.phase !== "open" && parent.phase !== "closed") refuse("Nobody has answered this one yet.");

  const view = await roundView(db, roundId, userId, now);
  if (!view.canTakePart) refuse("Only members can reply here.");
  if (view.visibility !== "all") refuse(view.visibility === "own" ? "You can reply once this one closes." : "Share yours first, then reply.");
  if (responseId && !view.responses.some((r) => r.id === responseId)) refuse("That answer isn't part of this round.");

  return suggestRound(db, { circleId: parent.circleId, userId, prompt, replyToRoundId: roundId, replyToResponseId: responseId, now, ...rest });
}

/** The replies to a round, oldest first, for its page. Withdrawn ones are left out. */
export async function repliesTo(db: DB, roundId: string, viewerId: string) {
  const rows = await db
    .select({
      id: rounds.id, phase: rounds.phase, question: prompts.question, authorId: rounds.authorId,
      authorName: user.name, authorEmail: user.email, createdAt: rounds.createdAt, openedAt: rounds.openedAt,
      closedAt: rounds.closedAt, closesAt: rounds.closesAt, replyToResponseId: rounds.replyToResponseId,
    })
    .from(rounds)
    .innerJoin(prompts, eq(prompts.id, rounds.promptId))
    .innerJoin(user, eq(user.id, rounds.authorId))
    .where(and(eq(rounds.replyToRoundId, roundId), inArray(rounds.phase, ["nominated", "queued", "open", "closed"])))
    .orderBy(asc(rounds.createdAt));
  const ids = rows.map((r) => r.id);
  const answered = ids.length
    ? await db.select({ roundId: responses.roundId, userId: responses.userId }).from(responses).where(inArray(responses.roundId, ids))
    : [];
  return rows.map((r) => ({
    ...r,
    author: r.authorId === viewerId ? "you" : displayName({ name: r.authorName, email: r.authorEmail }),
    shared: answered.filter((a) => a.roundId === r.id).length,
    sharedByMe: answered.some((a) => a.roundId === r.id && a.userId === viewerId),
  }));
}

/**
 * Where a reply sits: the chain of rounds it answers, oldest first, and the
 * answer it points at — shown only if the viewer could see it in its own round.
 */
export async function replyContext(db: DB, round: Round, viewerId: string) {
  if (!round.replyToRoundId) return null;
  const chain: { id: string; question: string }[] = [];
  const seen = new Set<string>([round.id]);
  for (let id: string | null = round.replyToRoundId; id && !seen.has(id); ) {
    seen.add(id);
    const [r] = await db
      .select({ id: rounds.id, question: prompts.question, parent: rounds.replyToRoundId })
      .from(rounds)
      .innerJoin(prompts, eq(prompts.id, rounds.promptId))
      .where(eq(rounds.id, id))
      .limit(1);
    if (!r) break;
    chain.unshift({ id: r.id, question: r.question });
    id = r.parent;
  }

  let answer: { name: string; text: string; audioUrl: string | null; audioSeconds: number | null } | null = null;
  if (round.replyToResponseId) {
    const parent = (await roundById(db, round.replyToRoundId))!;
    const prompt = (await promptById(db, parent.promptId))!;
    const [mine] = await db
      .select({ id: responses.id })
      .from(responses)
      .where(and(eq(responses.roundId, parent.id), eq(responses.userId, viewerId)))
      .limit(1);
    if (visibility(prompt.reveal, parent.phase === "closed", Boolean(mine)) === "all") {
      const [a] = await db
        .select({ text: responses.text, audioUrl: responses.audioUrl, audioSeconds: responses.audioSeconds, name: user.name, email: user.email, userId: responses.userId })
        .from(responses)
        .innerJoin(user, eq(user.id, responses.userId))
        .where(eq(responses.id, round.replyToResponseId))
        .limit(1);
      if (a) answer = { name: a.userId === viewerId ? "you" : displayName(a), text: a.text, audioUrl: a.audioUrl && listenPath.response(round.replyToResponseId), audioSeconds: a.audioSeconds };
    }
  }
  return { chain, answer };
}
