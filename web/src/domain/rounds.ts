// Rounds: one run of a prompt, in a circle or open to the whole gathering
// (PLAN §5, §6). The rules are 08's circle machine and gather module, rebuilt:
//
//   circle:     nominated ─(enough support, or the host promotes)→ queued
//               queued ─(a live slot frees, circle formed and hosted)→ open
//   gathering:  open from the moment it's posted (an open question)
//   open ─(every member responded · timer · author/host reveals)→ closed
//
// A round runs in a group (rounds.group_id): a circle, or a gathering for a
// question to everyone; which machine applies is the group's kind. Late
// responses still join after the close. After it, only text can change,
// and only when the round allows it; placements freeze, audio never changes.
// Everything is named. Transitions happen in the request that causes them;
// the only clock is a round's timer, settled on read and by the cron.

import { and, asc, count, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { groups, members, prompts, responseWords, responses, roundSupports, rounds, user, words } from "@/db/schema";
import { isOurAudio, listenPath } from "@/lib/audioStore";
import { newId } from "@/lib/id";
import { activeMemberCount, CIRCLE_MIN, isCircleMember } from "./circles";
import { groupById, membershipOf, requireMember, type Group } from "./gatherings";
import { refuse } from "./errors";
import { refreshHarvestItem } from "./harvests";
import { notifyCircle, notifyGathering, notifyOne } from "./notifications";
import { cleanWord, createPrompt, promptById, wordKey, type Prompt, type PromptInput } from "./prompts";

export type Round = typeof rounds.$inferSelect;
type Circle = Group;
const HOUR_MS = 3_600_000;

// ── Reading helpers ───────────────────────────────────────────────────────

export async function roundById(db: DB, id: string): Promise<Round | null> {
  const [r] = await db.select().from(rounds).where(eq(rounds.id, id)).limit(1);
  return r ?? null;
}

/** The group a round runs in. */
async function groupOf(db: DB, round: Round): Promise<Group> {
  return (await groupById(db, round.groupId)) ?? refuse("That question's group is gone.");
}

/** Is this the question at the centre of its gathering? */
export async function isPinned(db: DB, round: Pick<Round, "id" | "groupId">): Promise<boolean> {
  const [g] = await db.select({ pinnedRoundId: groups.pinnedRoundId }).from(groups).where(eq(groups.id, round.groupId)).limit(1);
  return g?.pinnedRoundId === round.id;
}

/** The circle a round runs in, or null for a question to everyone. */
async function circleOf(db: DB, round: Round): Promise<Circle | null> {
  const g = await groupOf(db, round);
  return g.kind === "circle" ? g : null;
}

/** Circle rounds: an active circle member. Open questions: any gathering member. */
async function mayTakePart(db: DB, round: Round, userId: string): Promise<boolean> {
  const g = await groupOf(db, round);
  if (g.kind === "circle") return isCircleMember(db, g.id, userId);
  return Boolean(await membershipOf(db, round.rootId, userId));
}

/** The round's author, the circle's host, or (for open questions) a gathering host. */
async function mayConduct(db: DB, round: Round, userId: string): Promise<boolean> {
  if (round.authorId === userId) return true;
  const g = await groupOf(db, round);
  if (g.kind === "circle") return g.hostId === userId;
  return (await membershipOf(db, round.rootId, userId))?.role === "host";
}

function cleanTimer(hours: unknown): number | null {
  if (hours === undefined || hours === null || hours === "") return null;
  const h = Math.round(Number(hours));
  if (!Number.isFinite(h) || h < 1) refuse("The timer is a whole number of hours.");
  return Math.min(h, 24 * 365);
}

type RoundSettings = { timerHours?: number | string | null; editAfterClose?: boolean };

function settings(s: RoundSettings) {
  return {
    timerHours: cleanTimer(s.timerHours),
    editAfterClose: s.editAfterClose ?? true,
  };
}

/** A new prompt, or an existing one from the same tree (a suggestion carried over). */
async function promptFor(db: DB, rootId: string, userId: string, p: PromptInput | { promptId: string }): Promise<Prompt> {
  if ("promptId" in p) {
    const existing = await promptById(db, p.promptId);
    if (!existing || existing.rootId !== rootId) refuse("That question isn't in this gathering.");
    return existing;
  }
  return createPrompt(db, { rootId, authorId: userId, ...p });
}

// ── The circle machine ────────────────────────────────────────────────────

/**
 * Supports needed to queue: the circle's setting, or a third of members (at
 * least 2), never more than there are members. A reply needs less: its author
 * and one other, since the circle already took up the round it answers.
 */
export function approvalsNeeded(circle: Pick<Circle, "approvalsToStart">, members: number, { reply = false } = {}): number {
  const setting = circle.approvalsToStart ?? Math.max(2, Math.ceil(members / 3));
  const wanted = reply ? Math.min(2, setting) : setting;
  return Math.max(1, Math.min(wanted, members));
}

/**
 * Supports a question needs in this circle. A circle that is still forming
 * decides as if it had its minimum, so its proposer alone can't line up its
 * questions before anyone else is in: the first question waits to open, and
 * the rest wait for the circle (STARTERS.md §2).
 */
export function questionApprovals(circle: Pick<Circle, "approvalsToStart" | "status">, members: number, opts: { reply?: boolean } = {}): number {
  return approvalsNeeded(circle, circle.status === "forming" ? Math.max(members, CIRCLE_MIN) : members, opts);
}

/** Open a round. `inCircle` says whether the circle is told. */
async function openRound(db: DB, round: Round, now: Date, inCircle: boolean): Promise<void> {
  await db
    .update(rounds)
    .set({ phase: "open", openedAt: now, closesAt: round.timerHours ? new Date(now.getTime() + round.timerHours * HOUR_MS) : null })
    .where(eq(rounds.id, round.id));
  if (inCircle && round.phase !== "open") {
    await notifyCircle(db, round.groupId, { kind: "round_opened", gatheringId: round.rootId, roundId: round.id, now });
  }
  const prompt = (await promptById(db, round.promptId))!;
  if (prompt.shape === "words" && prompt.seedWords.length) {
    await db
      .insert(words)
      .values(prompt.seedWords.map((label) => ({ id: newId(), roundId: round.id, label, key: wordKey(label), origin: "seeded" as const })))
      .onConflictDoNothing();
  }
}

async function closeRound(db: DB, roundId: string, via: "complete" | "timer" | "manual", now: Date, inCircle: boolean): Promise<void> {
  const [closed] = await db
    .update(rounds)
    .set({ phase: "closed", closedAt: now, closedVia: via })
    .where(and(eq(rounds.id, roundId), eq(rounds.phase, "open")))
    .returning();
  if (closed && inCircle) {
    await notifyCircle(db, closed.groupId, { kind: "round_revealed", gatheringId: closed.rootId, roundId, now });
  }
}

/**
 * Bring a circle up to date: close rounds whose timer ran out, then open
 * queued rounds into free live slots. A forming circle, or one with no host,
 * opens nothing new. Idempotent; safe to call on every read.
 */
export async function settleCircle(db: DB, circleId: string, now = new Date()): Promise<void> {
  const due = await db
    .select({ id: rounds.id })
    .from(rounds)
    .where(and(eq(rounds.groupId, circleId), eq(rounds.phase, "open"), lte(rounds.closesAt, now)));
  for (const r of due) await closeRound(db, r.id, "timer", now, true);

  const circle = await groupById(db, circleId);
  if (!circle || circle.status !== "active" || !circle.hostId) return;

  const [{ live }] = await db
    .select({ live: count() })
    .from(rounds)
    .where(and(eq(rounds.groupId, circleId), eq(rounds.phase, "open")));
  const free = circle.maxLive - live;
  if (free <= 0) return;

  const supportCount = sql<number>`(select count(*) from ${roundSupports} where ${roundSupports.roundId} = ${rounds.id})`;
  const next = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.groupId, circleId), eq(rounds.phase, "queued")))
    .orderBy(sql`${rounds.promotedAt} desc nulls last`, desc(supportCount), asc(rounds.queuedAt))
    .limit(free);
  for (const r of next) await openRound(db, r, now, true);
}

/** Queue a nominated round once it has enough support. */
async function maybeQueue(db: DB, round: Round, now: Date): Promise<void> {
  if (round.phase !== "nominated") return;
  const circle = await circleOf(db, round);
  if (!circle) return;
  const n_members = await activeMemberCount(db, circle.id);
  const [{ n }] = await db.select({ n: count() }).from(roundSupports).where(eq(roundSupports.roundId, round.id));
  if (n >= questionApprovals(circle, n_members, { reply: round.replyToRoundId !== null })) {
    await db.update(rounds).set({ phase: "queued", queuedAt: now }).where(eq(rounds.id, round.id));
  }
}

/** Put a question to your circle. Your own support counts. */
export async function suggestRound(
  db: DB,
  {
    circleId, userId, prompt, suggestedFromRoundId = null, replyToRoundId = null, replyToResponseId = null, now = new Date(), ...rest
  }: {
    circleId: string; userId: string; prompt: PromptInput | { promptId: string }; suggestedFromRoundId?: string | null;
    /** set through domain/replies.ts#suggestReply, which checks them */
    replyToRoundId?: string | null; replyToResponseId?: string | null; now?: Date;
  } & RoundSettings,
): Promise<Round> {
  const circle = await groupById(db, circleId);
  if (!circle || circle.kind !== "circle") refuse("That circle doesn't exist.");
  if (circle.status === "closed" || circle.status === "expired") refuse("This circle isn't running.");
  if (!(await isCircleMember(db, circleId, userId))) refuse("Only members can suggest a question here.");

  const p = await promptFor(db, circle.rootId, userId, prompt);
  const [already] = await db
    .select({ phase: rounds.phase })
    .from(rounds)
    .where(and(eq(rounds.groupId, circleId), eq(rounds.promptId, p.id), inArray(rounds.phase, ["nominated", "queued", "open"])))
    .limit(1);
  if (already) refuse(already.phase === "open" ? "That question is open in this circle right now." : "That question is already waiting in this circle.");
  const [round] = await db
    .insert(rounds)
    .values({
      id: newId(), promptId: p.id, groupId: circleId, rootId: circle.rootId, authorId: userId,
      suggestedFromRoundId, replyToRoundId, replyToResponseId, phase: "nominated", createdAt: now, ...settings(rest),
    })
    .returning();
  await db.insert(roundSupports).values({ roundId: round.id, userId, createdAt: now });
  await maybeQueue(db, round, now);
  await settleCircle(db, circleId, now);
  const after = (await roundById(db, round.id))!;
  // Still waiting on support: tell the circle so they can give it.
  if (after.phase === "nominated") {
    await notifyCircle(db, circleId, { kind: "suggested", gatheringId: circle.rootId, actorId: userId, roundId: round.id, now });
  }
  return after;
}

/** One support toggle per member, while a suggestion is waiting. */
export async function toggleSupport(db: DB, { roundId, userId, now = new Date() }: { roundId: string; userId: string; now?: Date }): Promise<boolean> {
  const round = (await roundById(db, roundId)) ?? refuse("That question doesn't exist.");
  const circle = (await circleOf(db, round)) ?? refuse("Open questions don't need support.");
  if (round.phase !== "nominated") refuse("This one is already on its way.");
  if (!(await isCircleMember(db, circle.id, userId))) refuse("Only members can support a question here.");

  const removed = await db
    .delete(roundSupports)
    .where(and(eq(roundSupports.roundId, roundId), eq(roundSupports.userId, userId)))
    .returning();
  if (removed.length) return false;
  await db.insert(roundSupports).values({ roundId, userId, createdAt: now });
  await maybeQueue(db, round, now);
  await settleCircle(db, circle.id, now);
  return true;
}

/** The host moves a suggestion to the front of the queue. */
export async function promoteRound(db: DB, { roundId, userId, now = new Date() }: { roundId: string; userId: string; now?: Date }): Promise<void> {
  const round = (await roundById(db, roundId)) ?? refuse("That question doesn't exist.");
  const circle = (await circleOf(db, round)) ?? refuse("Only circle questions can be promoted.");
  if (circle.hostId !== userId) refuse("Only the host can promote.");
  if (round.phase !== "nominated" && round.phase !== "queued") refuse("This one is already open.");
  await db.update(rounds).set({ phase: "queued", queuedAt: round.queuedAt ?? now, promotedAt: now }).where(eq(rounds.id, roundId));
  await settleCircle(db, circle.id, now);
}

// ── Open questions ────────────────────────────────────────────────────────

/** A question to the whole gathering. Open at once; no queue. */
export async function postOpenQuestion(
  db: DB,
  { gatheringId, userId, prompt, now = new Date(), ...rest }: { gatheringId: string; userId: string; prompt: PromptInput | { promptId: string }; now?: Date } & RoundSettings,
): Promise<Round> {
  const m = await requireMember(db, gatheringId, userId);
  const gathering = (await groupById(db, gatheringId)) ?? refuse("That gathering isn't here.");
  if (gathering.kind !== "gathering") refuse("Questions to everyone are asked in a gathering.");
  if (!gathering.membersPostOpenQuestions && m.role !== "host") refuse("In this gathering, hosts post the open questions.");

  const p = await promptFor(db, gathering.rootId, userId, prompt);
  const s = settings(rest);
  const [round] = await db
    .insert(rounds)
    .values({
      id: newId(), promptId: p.id, groupId: gatheringId, rootId: gathering.rootId, authorId: userId, phase: "open", createdAt: now, openedAt: now,
      closesAt: s.timerHours ? new Date(now.getTime() + s.timerHours * HOUR_MS) : null, ...s,
    })
    .returning();
  if (p.shape === "words") await openRound(db, round, now, false);
  await notifyGathering(db, { kind: "asked_everyone", gatheringId, actorId: userId, roundId: round.id, now });
  return round;
}

// ── Responding ────────────────────────────────────────────────────────────

export type ResponseInput = {
  text?: string;
  audioUrl?: string | null;
  audioSeconds?: number | null;
  x?: number | null;
  y?: number | null;
  /** words shape: ids of the round's words to pick, and new labels to coin */
  pick?: string[];
  coin?: string[];
};

const TEXT_MAX = 5000;
const unit = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/** Share or update an answer. Returns the answer's id. */
export async function respond(
  db: DB,
  { roundId, userId, input, now = new Date() }: { roundId: string; userId: string; input: ResponseInput; now?: Date },
): Promise<string> {
  const round = (await roundById(db, roundId)) ?? refuse("That question doesn't exist.");
  if (round.phase !== "open" && round.phase !== "closed") refuse("This question hasn't opened yet.");
  const circle = await circleOf(db, round);
  if (!(await mayTakePart(db, round, userId))) refuse("You're not part of this one.");
  const prompt = (await promptById(db, round.promptId))!;
  const closed = round.phase === "closed";

  const [existing] = await db
    .select()
    .from(responses)
    .where(and(eq(responses.roundId, roundId), eq(responses.userId, userId)))
    .limit(1);

  const text = (input.text ?? existing?.text ?? "").trim();
  if (text.length > TEXT_MAX) refuse("That's longer than a response can be.");

  if (existing && closed) {
    // After the close: text only, and only if the round allows it.
    if (!round.editAfterClose) refuse("Responses to this question can't be changed now.");
    await db.update(responses).set({ text, updatedAt: now }).where(eq(responses.id, existing.id));
    // Shared into a harvest already? It shows the answer as it is now.
    await refreshHarvestItem(db, { roundId, userId, now });
    return existing.id;
  }

  const tells = prompt.shape === "story" || prompt.shape === "story_placement";
  const places = prompt.shape === "placement" || prompt.shape === "story_placement";

  // Audio is fixed from the moment it's submitted, and only ever points at our storage.
  if (input.audioUrl && !existing?.audioUrl && !isOurAudio(input.audioUrl)) refuse("That recording didn't come from here.");
  if (input.audioUrl && !tells) refuse("This question doesn't take recordings.");
  const audioUrl = existing?.audioUrl ?? (input.audioUrl || null);
  const audioSeconds = existing?.audioUrl ? existing.audioSeconds : (input.audioSeconds ?? null);
  if (tells && !text && !audioUrl) refuse("Say something, or write it.");

  let x: number | null = null;
  let y: number | null = null;
  if (places) {
    x = input.x ?? existing?.x ?? null;
    y = input.y ?? existing?.y ?? null;
    if (!unit(x)) refuse("Place yourself on the line.");
    if (prompt.axes.length === 2 && !unit(y)) refuse("Place yourself in the square.");
    if (prompt.axes.length < 2) y = null;
  }

  const responseId = existing?.id ?? newId();
  // A new recording waits for its transcript (domain/transcripts.ts).
  const transcriptStatus = audioUrl && !existing?.audioUrl ? ("pending" as const) : (existing?.transcriptStatus ?? "none");
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(responses).set({ text, audioUrl, audioSeconds, x, y, transcriptStatus, updatedAt: now }).where(eq(responses.id, existing.id));
    } else {
      await tx.insert(responses).values({
        id: responseId, roundId, userId, text, audioUrl, audioSeconds, x, y,
        transcriptStatus, createdAt: now, updatedAt: now,
      });
    }

    if (prompt.shape === "words") {
      const pick = [...new Set(input.pick ?? [])];
      const coin = [...new Set((input.coin ?? []).map(cleanWord).filter(Boolean))];
      if (pick.length > (prompt.pickMax ?? 0)) refuse(`Pick up to ${prompt.pickMax}.`);
      if (coin.length > (prompt.coinMax ?? 0)) refuse(`Add up to ${prompt.coinMax} of your own.`);
      if (!pick.length && !coin.length) refuse("Choose at least one word.");

      const known = pick.length
        ? await tx.select({ id: words.id }).from(words).where(and(eq(words.roundId, roundId), inArray(words.id, pick)))
        : [];
      if (known.length !== pick.length) refuse("Some of those words aren't in this question.");

      const ids = known.map((w) => w.id);
      for (const label of coin) {
        const key = wordKey(label);
        const [row] = await tx
          .insert(words)
          .values({ id: newId(), roundId, label, key, origin: "coined", coinedBy: userId })
          .onConflictDoUpdate({ target: [words.roundId, words.key], set: { key } })
          .returning({ id: words.id });
        ids.push(row.id);
      }
      await tx.delete(responseWords).where(eq(responseWords.responseId, responseId));
      await tx.insert(responseWords).values([...new Set(ids)].map((wordId) => ({ responseId, wordId })));
    }
  });

  // Someone answered your question to everyone. Not for the pinned one: everyone answers that.
  if (!circle && !existing && !(await isPinned(db, round))) {
    await notifyOne(db, round.authorId, { kind: "answered", gatheringId: round.rootId, actorId: userId, roundId, now });
  }

  // A circle round closes when every member has responded.
  if (circle && round.phase === "open" && !existing) {
    const [{ m }] = await db
      .select({ m: count() })
      .from(members)
      .innerJoin(responses, and(eq(responses.userId, members.userId), eq(responses.roundId, roundId)))
      .where(and(eq(members.groupId, circle.id), isNull(members.leftAt)));
    const n_members = await activeMemberCount(db, circle.id);
    if (m >= n_members) await closeRound(db, roundId, "complete", now, true);
    await settleCircle(db, circle.id, now);
  }
  return responseId;
}

/** Reveal now: the author or host closes it by hand. */
export async function revealNow(db: DB, { roundId, userId, now = new Date() }: { roundId: string; userId: string; now?: Date }): Promise<void> {
  const round = (await roundById(db, roundId)) ?? refuse("That question doesn't exist.");
  if (round.phase !== "open") refuse("It isn't open.");
  if (await isPinned(db, round)) refuse("The pinned question stays open. Unpin it first.");
  if (!(await mayConduct(db, round, userId))) refuse("Only its author or the host can reveal it early.");
  const circle = await circleOf(db, round);
  await closeRound(db, roundId, "manual", now, Boolean(circle));
  if (circle) await settleCircle(db, circle.id, now);
}

// ── What a person sees ────────────────────────────────────────────────────

export type Visibility = "all" | "after_share" | "own";

/**
 * The reveal rule (PLAN §5): open → everything; after you share → everything
 * once you have; sealed → your own until the close. After the close, all.
 */
export function visibility(reveal: Prompt["reveal"], closed: boolean, responded: boolean): Visibility {
  if (closed || reveal === "open") return "all";
  if (reveal === "after_share") return responded ? "all" : "after_share";
  return "own";
}

function stats(values: number[]) {
  if (!values.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const spread = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return { mean, spread, count: values.length };
}

export async function roundView(db: DB, roundId: string, viewerId: string, now = new Date()) {
  let round = (await roundById(db, roundId)) ?? refuse("That question doesn't exist.");
  const circle = await circleOf(db, round);
  if (circle) {
    await settleCircle(db, circle.id, now);
    round = (await roundById(db, roundId))!;
  } else if (round.phase === "open" && round.closesAt && round.closesAt <= now) {
    await closeRound(db, roundId, "timer", now, false);
    round = (await roundById(db, roundId))!;
  }
  const prompt = (await promptById(db, round.promptId))!;
  const canTakePart = await mayTakePart(db, round, viewerId);

  const all = await db
    .select({
      id: responses.id, userId: responses.userId, name: user.name, email: user.email,
      text: responses.text, audioUrl: responses.audioUrl, audioSeconds: responses.audioSeconds,
      transcript: responses.transcript, transcriptStatus: responses.transcriptStatus, x: responses.x, y: responses.y,
      createdAt: responses.createdAt, updatedAt: responses.updatedAt,
    })
    .from(responses)
    .innerJoin(user, eq(user.id, responses.userId))
    .where(eq(responses.roundId, roundId))
    .orderBy(asc(responses.createdAt))
    .then((rows) => rows.map((r) => ({ ...r, audioUrl: r.audioUrl && listenPath.response(r.id) })));

  const mine = all.find((r) => r.userId === viewerId) ?? null;
  const closed = round.phase === "closed";
  const vis = visibility(prompt.reveal, closed, Boolean(mine));
  const visible = !canTakePart ? [] : vis === "all" ? all : vis === "own" && mine ? [mine] : [];

  const ids = visible.map((r) => r.id);
  const [wordRows, roundWords] = await Promise.all([
    ids.length && prompt.shape === "words"
      ? db.select().from(responseWords).where(inArray(responseWords.responseId, ids))
      : [],
    prompt.shape === "words"
      ? db.select().from(words).where(and(eq(words.roundId, roundId), eq(words.hidden, false))).orderBy(asc(words.label))
      : [],
  ]);
  const wordLabel = new Map(roundWords.map((w) => [w.id, w.label]));

  const shown = visible.map((r) => ({
    ...r,
    words: wordRows.filter((x) => x.responseId === r.id).map((x) => wordLabel.get(x.wordId)).filter((w): w is string => Boolean(w)),
  }));

  // The aggregate belongs to the group, so only when the whole group is visible.
  let aggregate: { x: ReturnType<typeof stats>; y: ReturnType<typeof stats>; words: { label: string; count: number }[] } | null = null;
  if (vis === "all" && canTakePart) {
    const counts = new Map<string, number>();
    for (const w of wordRows) counts.set(w.wordId, (counts.get(w.wordId) ?? 0) + 1);
    aggregate = {
      x: stats(all.map((r) => r.x).filter((v): v is number => v !== null)),
      y: stats(all.map((r) => r.y).filter((v): v is number => v !== null)),
      words: [...counts]
        .map(([id, count]) => ({ label: wordLabel.get(id) ?? "", count }))
        .filter((w) => w.label)
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    };
  }

  const expected = circle ? await activeMemberCount(db, circle.id) : null;
  return {
    round, prompt, canTakePart, visibility: vis,
    /** The circle it runs in, or null for a question to everyone. */
    circle,
    mayConduct: await mayConduct(db, round, viewerId),
    mine: mine ? shown.find((r) => r.id === mine.id) ?? { ...mine, words: [] } : null,
    responses: shown,
    responders: all.map((r) => r.userId),
    expected,
    vocabulary: roundWords.map((w) => ({ id: w.id, label: w.label, origin: w.origin })),
    aggregate,
  };
}

/**
 * The stored recording behind one answer, for /api/listen, or null if the
 * viewer may not hear it: their own, or one roundView would show them.
 */
export async function responseAudio(db: DB, responseId: string, viewerId: string): Promise<string | null> {
  const [r] = await db
    .select({ roundId: responses.roundId, userId: responses.userId, audioUrl: responses.audioUrl })
    .from(responses)
    .where(eq(responses.id, responseId))
    .limit(1);
  if (!r?.audioUrl) return null;
  if (r.userId === viewerId) return r.audioUrl;
  const round = (await roundById(db, r.roundId))!;
  if (!(await mayTakePart(db, round, viewerId))) return null;
  const prompt = (await promptById(db, round.promptId))!;
  const [mine] = await db
    .select({ id: responses.id })
    .from(responses)
    .where(and(eq(responses.roundId, round.id), eq(responses.userId, viewerId)))
    .limit(1);
  return visibility(prompt.reveal, round.phase === "closed", Boolean(mine)) === "all" ? r.audioUrl : null;
}

/** The circle's rounds, with support counts, for its page. */
export async function circleRounds(db: DB, circleId: string, viewerId: string, now = new Date()) {
  await settleCircle(db, circleId, now);
  const rows = await db
    .select({
      id: rounds.id, phase: rounds.phase, question: prompts.question, shape: prompts.shape, reveal: prompts.reveal,
      authorId: rounds.authorId, authorName: user.name, authorEmail: user.email,
      createdAt: rounds.createdAt, openedAt: rounds.openedAt, closedAt: rounds.closedAt, closesAt: rounds.closesAt,
      promotedAt: rounds.promotedAt, queuedAt: rounds.queuedAt,
      replyToRoundId: rounds.replyToRoundId, replyToResponseId: rounds.replyToResponseId,
      supports: sql<number>`(select count(*)::int from ${roundSupports} where ${roundSupports.roundId} = ${rounds.id})`,
      supportedByMe: sql<boolean>`exists(select 1 from ${roundSupports} where ${roundSupports.roundId} = ${rounds.id} and ${roundSupports.userId} = ${viewerId})`,
      responded: sql<number>`(select count(*)::int from ${responses} where ${responses.roundId} = ${rounds.id})`,
      respondedByMe: sql<boolean>`exists(select 1 from ${responses} where ${responses.roundId} = ${rounds.id} and ${responses.userId} = ${viewerId})`,
    })
    .from(rounds)
    .innerJoin(prompts, eq(prompts.id, rounds.promptId))
    .innerJoin(user, eq(user.id, rounds.authorId))
    .where(eq(rounds.groupId, circleId))
    .orderBy(asc(rounds.createdAt));
  return rows;
}

/** Gathering members who can see an open question: used for counts on the gathering page. */
export async function gatheringMemberTotal(db: DB, gatheringId: string): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(members).where(and(eq(members.groupId, gatheringId), isNull(members.leftAt)));
  return n;
}

/** Open questions to the whole gathering, newest first, the pinned one first of all. */
export async function gatheringQuestions(db: DB, gatheringId: string, viewerId: string, now = new Date()) {
  await db
    .update(rounds)
    .set({ phase: "closed", closedAt: now, closedVia: "timer" })
    .where(and(eq(rounds.groupId, gatheringId), eq(rounds.phase, "open"), lte(rounds.closesAt, now)));
  return db
    .select({
      id: rounds.id, phase: rounds.phase, pinned: sql<boolean>`${groups.pinnedRoundId} = ${rounds.id}`, question: prompts.question, shape: prompts.shape,
      authorName: user.name, authorEmail: user.email, openedAt: rounds.openedAt, closesAt: rounds.closesAt,
      responded: sql<number>`(select count(*)::int from ${responses} where ${responses.roundId} = ${rounds.id})`,
      respondedByMe: sql<boolean>`exists(select 1 from ${responses} where ${responses.roundId} = ${rounds.id} and ${responses.userId} = ${viewerId})`,
    })
    .from(rounds)
    .innerJoin(prompts, eq(prompts.id, rounds.promptId))
    .innerJoin(user, eq(user.id, rounds.authorId))
    .innerJoin(groups, eq(groups.id, rounds.groupId))
    .where(and(eq(rounds.groupId, gatheringId), inArray(rounds.phase, ["open", "closed"])))
    .orderBy(desc(sql`${groups.pinnedRoundId} = ${rounds.id}`), desc(rounds.openedAt));
}

/** Who answered each of a circle's rounds: the circle map's participation lines. */
export async function circleResponders(db: DB, circleId: string): Promise<Record<string, string[]>> {
  const rows = await db
    .select({ roundId: responses.roundId, userId: responses.userId })
    .from(responses)
    .innerJoin(rounds, eq(rounds.id, responses.roundId))
    .where(eq(rounds.groupId, circleId))
    .orderBy(asc(responses.createdAt));
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.roundId] ??= []).push(r.userId);
  return out;
}
