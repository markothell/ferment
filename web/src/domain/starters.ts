// Starters: a gathering's design with the people taken out (STARTERS.md).
//
// A starter holds the welcome note, the circles with their questions in
// order, and the questions to everyone (the first is pinned to the centre when
// a gathering begins from it, GROUPS.md §5). It is saved from a
// gathering, copied from another starter, or written by us (web/starters/).
// A gathering is started from one, or has one added.
//
// Lineage is recorded as things are made and never rewritten:
//   starter → starter    forked_from_id (+ its title, in case it goes)
//   starter → gathering  groups.starter_id
//   question → question  each question's key; a prompt keeps (starter_id, starter_key);
//                        a question saved again records `from` the one it came from.
//
// Seeding never schedules anything. Each circle is proposed with its first
// question queued, as createCircle does, and the rest wait as the host's
// suggestions, in order, for the circle to take up or not.

import { and, asc, count, desc, eq, getTableColumns, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import type { DB } from "@/db";
import {
  groups, members, prompts, roundSupports, rounds, starters, user, words,
  type StarterCircle, type StarterContent, type StarterQuestion,
} from "@/db/schema";
import { isCurator } from "@/lib/access";
import { isCircleColor } from "@/lib/circleColors";
import { newId } from "@/lib/id";
import { displayName } from "@/lib/names";
import { refuse } from "./errors";
import { createGathering, groupById, NOTE_MAX, requireHost, requireMember, slugTaken, type Gathering } from "./gatherings";
import { notifyGathering } from "./notifications";
import { normalizePrompt, wordKey, type PromptInput } from "./prompts";
import { slugify, uniqueSlug } from "./slug";

export type Starter = typeof starters.$inferSelect;
export type { StarterCircle, StarterContent, StarterQuestion };

export const TITLE_MAX = 80;
export const SUMMARY_MAX = 500;
const CIRCLES_MAX = 12;
const QUESTIONS_PER_CIRCLE = 20;
const OPEN_QUESTIONS_MAX = 10;
const KEY_MAX = 60;
const TIMER_MAX = 24 * 365;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

type Viewer = { id: string; email: string } | null;

// ── The design: checked on the way in ─────────────────────────────────────

function cleanKey(raw: unknown, taken: Set<string>): string {
  let key = typeof raw === "string" ? raw.trim().slice(0, KEY_MAX) : "";
  if (!key || taken.has(key)) key = newId();
  taken.add(key);
  return key;
}

function cleanFrom(raw: unknown): StarterQuestion["from"] {
  const f = raw as { starterId?: unknown; key?: unknown } | null | undefined;
  return f && typeof f.starterId === "string" && typeof f.key === "string" ? { starterId: f.starterId, key: f.key } : null;
}

function cleanTimer(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const h = Math.round(Number(raw));
  return Number.isFinite(h) && h >= 1 ? Math.min(h, TIMER_MAX) : null;
}

function cleanQuestion(raw: unknown, keys: Set<string>): StarterQuestion {
  const q = (raw ?? {}) as Partial<StarterQuestion>;
  // A stored null means "not set": let the prompt rules fill the default.
  const input: PromptInput = {
    question: q.question ?? "", context: q.context ?? "", shape: q.shape, axes: q.axes ?? [],
    placing: q.placing ?? undefined, telling: q.telling ?? undefined, seedWords: q.seedWords ?? [],
    pickMax: q.pickMax ?? undefined, coinMax: q.coinMax ?? undefined, secondsPerNote: q.secondsPerNote ?? undefined,
    reveal: q.reveal,
  };
  return { key: cleanKey(q.key, keys), from: cleanFrom(q.from), ...normalizePrompt(input), timerHours: cleanTimer(q.timerHours) };
}

/** Validate a starter's design and fill defaults. Every question passes the prompt rules. */
export function normalizeStarterContent(raw: unknown): StarterContent {
  const c = (raw ?? {}) as Partial<StarterContent>;
  const keys = new Set<string>();

  const welcomeNote = (c.welcomeNote ?? "").trim();
  if (welcomeNote.length > NOTE_MAX) refuse("That welcome note is too long.");

  // A design saved before the pinned question had a welcome question of its
  // own: it becomes the first question to everyone, a story told by voice.
  const legacy = (c as { welcomeQuestion?: { key?: string; from?: unknown; question?: string } | null }).welcomeQuestion;
  const carried = legacy && legacy.question?.trim()
    ? [{ key: legacy.key, from: legacy.from, question: legacy.question, shape: "story", telling: "voice", reveal: "open" }]
    : [];

  const rawCircles = c.circles ?? [];
  if (rawCircles.length > CIRCLES_MAX) refuse(`A starter has ${CIRCLES_MAX} circles at most.`);
  const circleKeys = new Set<string>();
  const circleList: StarterCircle[] = rawCircles.map((rc) => {
    const name = (rc?.name ?? "").trim().replace(/\s+/g, " ");
    if (!name) refuse("Every circle needs a name.");
    if (name.length > 60) refuse("Circle names are 60 characters at most.");
    const description = (rc.description ?? "").trim();
    if (description.length > 500) refuse("A circle's description is 500 characters at most.");
    const qs = rc.questions ?? [];
    if (qs.length > QUESTIONS_PER_CIRCLE) refuse(`A circle has ${QUESTIONS_PER_CIRCLE} questions at most.`);
    return {
      key: cleanKey(rc.key, circleKeys), name, description,
      color: isCircleColor(rc.color) ? rc.color : "saffron",
      questions: qs.map((q) => cleanQuestion(q, keys)),
    };
  });

  const rawOpen = [...carried, ...(c.openQuestions ?? [])];
  if (rawOpen.length > OPEN_QUESTIONS_MAX) refuse(`A starter has ${OPEN_QUESTIONS_MAX} questions to everyone at most.`);
  const openQuestions = rawOpen.map((q) => cleanQuestion(q, keys));

  return { welcomeNote, circles: circleList, openQuestions };
}

/** How many questions a design holds. */
export function questionCount(c: StarterContent): number {
  return c.circles.reduce((n, k) => n + k.questions.length, 0) + c.openQuestions.length;
}

function cleanTitle(raw: string): string {
  const title = raw.trim().replace(/\s+/g, " ");
  if (!title) refuse("Give the starter a title.");
  if (title.length > TITLE_MAX) refuse(`Titles are ${TITLE_MAX} characters at most.`);
  return title;
}

function cleanSummary(raw: string): string {
  const summary = raw.trim();
  if (summary.length > SUMMARY_MAX) refuse(`Keep the summary under ${SUMMARY_MAX} characters.`);
  return summary;
}

// /library/mine is the shelf, so no starter may be called that.
const RESERVED = new Set(["mine"]);

async function freeSlug(db: DB, title: string): Promise<string> {
  return uniqueSlug(title, async (s) => RESERVED.has(s) || Boolean((await db.select({ id: starters.id }).from(starters).where(eq(starters.slug, s)).limit(1))[0]));
}

// ── Reading ───────────────────────────────────────────────────────────────

export async function starterById(db: DB, id: string): Promise<Starter | null> {
  const [s] = await db.select().from(starters).where(eq(starters.id, id)).limit(1);
  return s ?? null;
}

export async function starterBySlug(db: DB, slug: string): Promise<Starter | null> {
  const [s] = await db.select().from(starters).where(eq(starters.slug, slug)).limit(1);
  return s ?? null;
}

/** Published starters are for everyone; a private one only for whoever made it. */
export function mayView(s: Pick<Starter, "visibility" | "authorId">, viewer: Viewer): boolean {
  return s.visibility === "published" || (viewer !== null && s.authorId === viewer.id);
}

/** A starter someone may use: start from, add, or copy. */
async function usable(db: DB, starterId: string, viewer: Viewer): Promise<Starter> {
  const s = await starterById(db, starterId);
  if (!s || !mayView(s, viewer)) refuse("That starter isn't here.");
  return s;
}

const byWhom = (s: { authorId: string | null; authorName: string | null; authorEmail: string | null }) =>
  s.authorId === null ? "ferment" : s.authorName || s.authorEmail ? displayName({ name: s.authorName ?? "", email: s.authorEmail ?? "" }) : "someone who left";

async function startedCounts(db: DB, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: groups.starterId, n: count() })
    .from(groups)
    .where(inArray(groups.starterId, ids))
    .groupBy(groups.starterId);
  return new Map(rows.map((r) => [r.id!, r.n]));
}

/** A card: enough to choose from a list. */
function card(s: Starter & { authorName: string | null; authorEmail: string | null }, started: Map<string, number>) {
  return {
    id: s.id, slug: s.slug, title: s.title, summary: s.summary, visibility: s.visibility,
    by: byWhom(s), fromFerment: s.authorId === null,
    circles: s.content.circles.length, questions: questionCount(s.content),
    started: started.get(s.id) ?? 0, updatedAt: s.updatedAt,
  };
}
export type StarterCard = ReturnType<typeof card>;

async function cards(db: DB, rows: (Starter & { authorName: string | null; authorEmail: string | null })[]) {
  const started = await startedCounts(db, rows.map((r) => r.id));
  return rows.map((r) => card(r, started));
}

const withAuthor = { ...getTableColumns(starters), authorName: user.name, authorEmail: user.email };

/** The library: published starters, ours first, then the ones that have started the most gatherings. */
export async function library(db: DB): Promise<StarterCard[]> {
  const rows = await db.select(withAuthor).from(starters).leftJoin(user, eq(user.id, starters.authorId)).where(eq(starters.visibility, "published"));
  return (await cards(db, rows)).sort(
    (a, b) => Number(b.fromFerment) - Number(a.fromFerment) || b.started - a.started || a.title.localeCompare(b.title),
  );
}

/** Your shelf: everything you've saved or copied, newest change first. */
export async function myStarters(db: DB, userId: string): Promise<StarterCard[]> {
  const rows = await db
    .select(withAuthor)
    .from(starters)
    .leftJoin(user, eq(user.id, starters.authorId))
    .where(eq(starters.authorId, userId))
    .orderBy(desc(starters.updatedAt));
  return cards(db, rows);
}

/** What a host can add to a gathering: the library and their own shelf. */
export async function startersToAdd(db: DB, userId: string): Promise<StarterCard[]> {
  const [mine, published] = await Promise.all([myStarters(db, userId), library(db)]);
  return [...mine, ...published.filter((p) => !mine.some((m) => m.id === p.id))];
}

/**
 * Where a starter came from and where it went. Ancestors are named only when
 * the viewer may see them; private copies are counted, never named.
 */
export async function starterLineage(db: DB, s: Starter, viewer: Viewer) {
  type Step = { slug: string | null; title: string; by: string };
  const ancestors: Step[] = [];
  let at: Starter = s;
  for (let depth = 0; depth < 12 && (at.forkedFromId || at.forkedFromTitle); depth++) {
    const parent = at.forkedFromId ? await starterById(db, at.forkedFromId) : null;
    if (!parent) {
      ancestors.push({ slug: null, title: `${at.forkedFromTitle ?? "A starter"} (no longer here)`, by: "" });
      break;
    }
    if (!mayView(parent, viewer)) {
      ancestors.push({ slug: null, title: "a private starter", by: "" });
      break;
    }
    const [who] = parent.authorId
      ? await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, parent.authorId)).limit(1)
      : [];
    ancestors.push({
      slug: parent.slug, title: parent.title,
      by: byWhom({ authorId: parent.authorId, authorName: who?.name ?? null, authorEmail: who?.email ?? null }),
    });
    at = parent;
  }

  const copies = await db
    .select(withAuthor)
    .from(starters)
    .leftJoin(user, eq(user.id, starters.authorId))
    .where(eq(starters.forkedFromId, s.id))
    .orderBy(asc(starters.createdAt));
  const shown = copies.filter((c) => mayView(c, viewer));
  const [{ started }] = await db.select({ started: count() }).from(groups).where(eq(groups.starterId, s.id));
  // Questions that have actually opened somewhere: seeded suggestions a circle never took up don't count.
  const [{ opened }] = await db
    .select({ opened: count() })
    .from(rounds)
    .innerJoin(prompts, eq(prompts.id, rounds.promptId))
    .where(and(eq(prompts.starterId, s.id), isNotNull(rounds.openedAt)));

  return {
    by: s.authorId === null ? "ferment" : await authorName(db, s.authorId),
    ancestors,
    copies: shown.map((c) => ({ slug: c.slug, title: c.title, by: byWhom(c), mine: viewer?.id === c.authorId })),
    otherCopies: copies.length - shown.length,
    started,
    opened,
  };
}

async function authorName(db: DB, userId: string): Promise<string> {
  const [u] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
  return u ? displayName(u) : "someone who left";
}

/** The starters you've saved from this gathering: "update" instead of making another. */
export async function savedFrom(db: DB, gatheringId: string, userId: string) {
  return db
    .select({ id: starters.id, slug: starters.slug, title: starters.title, summary: starters.summary })
    .from(starters)
    .where(and(eq(starters.madeFromGroupId, gatheringId), eq(starters.authorId, userId)))
    .orderBy(desc(starters.updatedAt));
}

// ── From a gathering to a design ──────────────────────────────────────────

type PromptRow = typeof prompts.$inferSelect;

/**
 * The design of a gathering as it stands. Its circles' questions come in the
 * order the circle met them: what has run, then what's queued, then what's
 * suggested. The pinned question leads the questions to everyone. Follow-ups
 * and skipped questions stay behind. With `keep`, a question that came from
 * that starter keeps its key there (an update).
 */
export async function starterFromGathering(db: DB, gatheringId: string, keep: Starter | null = null): Promise<StarterContent> {
  const g = await groupById(db, gatheringId);
  if (!g) refuse("That gathering isn't here.");

  const [circleRows, roundRows] = await Promise.all([
    db.select().from(groups)
      .where(and(eq(groups.parentId, gatheringId), notInArray(groups.status, ["closed", "expired"])))
      .orderBy(asc(groups.createdAt)),
    db.select({ round: rounds, prompt: prompts })
      .from(rounds)
      .innerJoin(prompts, eq(prompts.id, rounds.promptId))
      .where(and(eq(rounds.rootId, gatheringId), isNull(rounds.replyToRoundId), notInArray(rounds.phase, ["skipped"]))),
  ]);

  // Updating: each question keeps its key in `keep`, so copies made from it
  // still point at the right one. Matched by the key itself, then by the
  // question it came from, then by its words. Anything else is new.
  const before = keep ? [...keep.content.circles.flatMap((c) => c.questions), ...keep.content.openQuestions] : [];
  const used = new Set<string>();
  const same = (a: StarterQuestion["from"], starterId: string | null, key: string | null) => a?.starterId === starterId && a?.key === key;
  const lineage = (p: PromptRow) => {
    const origin = p.starterId && p.starterKey ? { starterId: p.starterId, key: p.starterKey } : null;
    const match =
      before.find((q) => !used.has(q.key) && keep && p.starterId === keep.id && q.key === p.starterKey) ??
      before.find((q) => !used.has(q.key) && origin && same(q.from, origin.starterId, origin.key)) ??
      before.find((q) => !used.has(q.key) && q.question === p.question);
    if (match) {
      used.add(match.key);
      return { key: match.key, from: match.from ?? null };
    }
    return { key: newId(), from: origin };
  };
  const question = (p: PromptRow, timerHours: number | null): StarterQuestion => ({
    ...lineage(p),
    question: p.question, context: p.context, shape: p.shape, axes: p.axes, placing: p.placing, telling: p.telling,
    seedWords: p.seedWords, pickMax: p.pickMax, coinMax: p.coinMax, secondsPerNote: p.secondsPerNote, reveal: p.reveal,
    timerHours,
  });

  const rank = (r: typeof rounds.$inferSelect) => {
    if (r.openedAt) return [0, r.openedAt.getTime()];
    if (r.phase === "queued") return [1, r.promotedAt ? -r.promotedAt.getTime() : 0, r.queuedAt?.getTime() ?? 0];
    return [2, r.createdAt.getTime()];
  };
  const earlier = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
    return 0;
  };
  const onceEach = (rows: typeof roundRows) => {
    const seen = new Set<string>();
    return rows.filter((r) => !seen.has(r.prompt.id) && Boolean(seen.add(r.prompt.id)));
  };

  const pinnedFirst = (a: { round: { id: string } }, b: { round: { id: string } }) =>
    Number(b.round.id === g.pinnedRoundId) - Number(a.round.id === g.pinnedRoundId);
  const content: StarterContent = {
    welcomeNote: g.note,
    circles: circleRows.map((c) => ({
      key: newId(), name: c.name, description: c.note, color: c.color,
      questions: onceEach(roundRows.filter((r) => r.round.groupId === c.id).sort((a, b) => earlier(rank(a.round), rank(b.round))))
        .map((r) => question(r.prompt, r.round.timerHours)),
    })),
    openQuestions: onceEach(
      roundRows.filter((r) => r.round.groupId === gatheringId)
        .sort((a, b) => pinnedFirst(a, b) || a.round.createdAt.getTime() - b.round.createdAt.getTime()),
    ).map((r) => question(r.prompt, r.round.timerHours)),
  };
  if (!questionCount(content)) refuse("There's nothing to save yet. Ask everyone a question, or add a circle with one.");
  return normalizeStarterContent(content);
}

/**
 * Save a gathering's design to your shelf, as a new private starter or over
 * one you saved from it before. Hosts only. A gathering started from a starter
 * makes a copy of it, so the new one is linked to where it came from.
 */
export async function saveStarter(
  db: DB,
  {
    gatheringId, userId, title, summary = "", replaceId = null, now = new Date(),
  }: { gatheringId: string; userId: string; title: string; summary?: string; replaceId?: string | null; now?: Date },
): Promise<Starter> {
  await requireHost(db, gatheringId, userId);
  const cleanT = cleanTitle(title);
  const cleanS = cleanSummary(summary);

  if (replaceId) {
    const existing = await starterById(db, replaceId);
    if (!existing || existing.authorId !== userId || existing.madeFromGroupId !== gatheringId) {
      refuse("You can only update a starter you saved from this gathering.");
    }
    const content = await starterFromGathering(db, gatheringId, existing);
    const [s] = await db
      .update(starters)
      .set({ title: cleanT, summary: cleanS, content, updatedAt: now })
      .where(eq(starters.id, replaceId))
      .returning();
    return s;
  }

  const content = await starterFromGathering(db, gatheringId);
  const [g] = await db.select({ starterId: groups.starterId }).from(groups).where(eq(groups.id, gatheringId)).limit(1);
  const parent = g.starterId ? await starterById(db, g.starterId) : null;
  const [s] = await db
    .insert(starters)
    .values({
      id: newId(), slug: await freeSlug(db, cleanT), title: cleanT, summary: cleanS, authorId: userId,
      visibility: "private", forkedFromId: parent?.id ?? null, forkedFromTitle: parent?.title ?? null,
      madeFromGroupId: gatheringId, content, createdAt: now, updatedAt: now,
    })
    .returning();
  return s;
}

/** Copy a starter you can see onto your own shelf. Each question remembers the one it was copied from. */
export async function copyStarter(
  db: DB,
  { starterId, viewer, now = new Date() }: { starterId: string; viewer: { id: string; email: string }; now?: Date },
): Promise<Starter> {
  const source = await usable(db, starterId, viewer);
  const descend = (q: StarterQuestion): StarterQuestion => ({ ...q, key: newId(), from: { starterId: source.id, key: q.key } });
  const c = source.content;
  const content = normalizeStarterContent({
    welcomeNote: c.welcomeNote,
    circles: c.circles.map((k) => ({ ...k, key: newId(), questions: k.questions.map(descend) })),
    openQuestions: c.openQuestions.map(descend),
  });
  const title = cleanTitle(source.authorId === viewer.id ? `${source.title} (copy)`.slice(0, TITLE_MAX) : source.title);
  const [s] = await db
    .insert(starters)
    .values({
      id: newId(), slug: await freeSlug(db, title), title, summary: source.summary, authorId: viewer.id, visibility: "private",
      forkedFromId: source.id, forkedFromTitle: source.title, content, createdAt: now, updatedAt: now,
    })
    .returning();
  return s;
}

/** Retitle or redescribe your own starter. */
export async function describeStarter(
  db: DB,
  { starterId, userId, title, summary, now = new Date() }: { starterId: string; userId: string; title: string; summary: string; now?: Date },
): Promise<void> {
  const s = await starterById(db, starterId);
  if (!s || s.authorId !== userId) refuse("Only whoever made a starter can change it.");
  await db.update(starters).set({ title: cleanTitle(title), summary: cleanSummary(summary), updatedAt: now }).where(eq(starters.id, starterId));
}

/**
 * Put a starter in the library, or take it out. Curators only: they publish
 * their own or ours, and can take any published starter down.
 */
export async function setPublished(
  db: DB,
  { starterId, viewer, published, now = new Date() }: { starterId: string; viewer: { id: string; email: string }; published: boolean; now?: Date },
): Promise<void> {
  if (!isCurator(viewer.email)) refuse("Only curators can change what's in the library.");
  const s = await starterById(db, starterId);
  if (!s) refuse("That starter isn't here.");
  if (published && s.authorId !== null && s.authorId !== viewer.id) refuse("Curators publish their own starters. Copy this one first.");
  if (!published && s.visibility !== "published" && s.authorId !== viewer.id) refuse("That starter isn't here.");
  await db
    .update(starters)
    .set(published ? { visibility: "published", publishedAt: s.publishedAt ?? now } : { visibility: "private" })
    .where(eq(starters.id, starterId));
}

/** Delete your own starter while it's off the library. Its copies keep its title. */
export async function deleteStarter(db: DB, { starterId, userId }: { starterId: string; userId: string }): Promise<void> {
  const s = await starterById(db, starterId);
  if (!s || s.authorId !== userId) refuse("Only whoever made a starter can delete it.");
  if (s.visibility === "published") refuse("It's in the library. Take it out first.");
  await db.delete(starters).where(eq(starters.id, starterId));
}

// ── From a design to a gathering ──────────────────────────────────────────

type Seeded = { openRounds: string[] };

/**
 * Fill a gathering from a design, inside the caller's transaction: circles
 * proposed by the host, each with its first question queued and the rest
 * suggested; questions to everyone open, the first of them pinned if nothing
 * is; the welcome note only where the gathering has none.
 */
async function seed(
  tx: DB,
  { gathering, hostId, starter, now }: { gathering: Gathering; hostId: string; starter: Starter; now: Date },
): Promise<Seeded> {
  const content = starter.content;
  const seeded: Seeded = { openRounds: [] };
  let tick = 0;
  const at = () => new Date(now.getTime() + tick++); // keeps the starter's order where rows sort by time

  const makePrompt = async (q: Omit<StarterQuestion, "key" | "from" | "timerHours">, key: string) => {
    const id = newId();
    const { question, context, shape, axes, placing, telling, seedWords, pickMax, coinMax, secondsPerNote, reveal } = q;
    await tx.insert(prompts).values({
      id, rootId: gathering.rootId, authorId: hostId, starterId: starter.id, starterKey: key,
      question, context, shape, axes, placing, telling, seedWords, pickMax, coinMax, secondsPerNote, reveal, createdAt: now,
    });
    return id;
  };

  if (!gathering.note && content.welcomeNote) {
    await tx.update(groups).set({ note: content.welcomeNote }).where(eq(groups.id, gathering.id));
  }

  // Slugs are unique across the site; the ones made here are seen by slugTaken inside the transaction.
  for (const c of content.circles) {
    const slug = await uniqueSlug(c.name, (s) => slugTaken(tx, s));
    const promptIds: string[] = [];
    for (const q of c.questions) promptIds.push(await makePrompt(q, q.key));
    const circleId = newId();
    await tx.insert(groups).values({
      id: circleId, kind: "circle", parentId: gathering.id, rootId: gathering.rootId, slug, name: c.name, note: c.description, color: c.color,
      hostId, createdBy: hostId, status: "forming", originPromptId: promptIds[0] ?? null, createdAt: at(),
      formingExpiresAt: new Date(now.getTime() + gathering.proposalExpiryDays * DAY_MS),
    });
    await tx.insert(members).values({ groupId: circleId, userId: hostId, joinedAt: now });
    for (const [i, q] of c.questions.entries()) {
      const when = at();
      const roundId = newId();
      await tx.insert(rounds).values({
        id: roundId, promptId: promptIds[i], groupId: circleId, rootId: gathering.rootId, authorId: hostId,
        phase: i === 0 ? "queued" : "nominated", createdAt: when, queuedAt: i === 0 ? when : null, timerHours: q.timerHours,
      });
      if (i > 0) await tx.insert(roundSupports).values({ roundId, userId: hostId, createdAt: when });
    }
  }

  for (const q of content.openQuestions) {
    const promptId = await makePrompt(q, q.key);
    const roundId = newId();
    const opened = at();
    await tx.insert(rounds).values({
      id: roundId, promptId, groupId: gathering.id, rootId: gathering.rootId, authorId: hostId, phase: "open", createdAt: opened, openedAt: opened,
      timerHours: q.timerHours, closesAt: q.timerHours ? new Date(opened.getTime() + q.timerHours * HOUR_MS) : null,
    });
    if (q.shape === "words" && q.seedWords.length) {
      await tx.insert(words).values(q.seedWords.map((label) => ({ id: newId(), roundId, label, key: wordKey(label), origin: "seeded" as const })));
    }
    seeded.openRounds.push(roundId);
  }
  if (seeded.openRounds.length && !gathering.pinnedRoundId) {
    await tx.update(groups).set({ pinnedRoundId: seeded.openRounds[0] }).where(eq(groups.id, gathering.id));
  }
  return seeded;
}

/** Start a new gathering from a starter: you host it, and it opens with the starter's design. */
export async function startFromStarter(
  db: DB,
  {
    starterId, viewer, name, welcomeNote, now = new Date(),
  }: { starterId: string; viewer: { id: string; email: string }; name: string; welcomeNote?: string; now?: Date },
): Promise<Gathering> {
  const starter = await usable(db, starterId, viewer);
  return createGathering(db, {
    userId: viewer.id, name, welcomeNote: welcomeNote ?? starter.content.welcomeNote, starterId: starter.id, now,
    seed: async (tx, gathering) => { await seed(tx, { gathering, hostId: viewer.id, starter, now }); },
  });
}

/**
 * Add a starter to a gathering you host: its circles and questions to
 * everyone join what's there. The welcome note and the pinned question are
 * filled only if the gathering has none. Everyone hears about the new open questions.
 */
export async function addStarter(
  db: DB,
  { gatheringId, starterId, viewer, now = new Date() }: { gatheringId: string; starterId: string; viewer: { id: string; email: string }; now?: Date },
): Promise<void> {
  await requireHost(db, gatheringId, viewer.id);
  const starter = await usable(db, starterId, viewer);
  const gathering = (await groupById(db, gatheringId)) ?? refuse("That gathering isn't here.");
  const seeded = await db.transaction(async (tx) => {
    const out = await seed(tx as unknown as DB, { gathering, hostId: viewer.id, starter, now });
    if (!gathering.starterId) await tx.update(groups).set({ starterId: starter.id }).where(eq(groups.id, gatheringId));
    return out;
  });
  for (const roundId of seeded.openRounds) {
    await notifyGathering(db, { kind: "asked_everyone", gatheringId, actorId: viewer.id, roundId, now });
  }
}

/** Where a gathering came from, for its own pages: the starter's title, linked when the viewer may open it. */
export async function gatheringOrigin(db: DB, gatheringId: string, viewer: Viewer) {
  await requireMember(db, gatheringId, viewer!.id);
  const [g] = await db.select({ starterId: groups.starterId }).from(groups).where(eq(groups.id, gatheringId)).limit(1);
  const s = g?.starterId ? await starterById(db, g.starterId) : null;
  if (!s) return null;
  return { title: s.title, slug: mayView(s, viewer) ? s.slug : null };
}

// ── Our own starters (web/starters/*.json) ────────────────────────────────

export type CuratedStarter = { slug: string; title: string; summary: string; content: StarterContent };

/** Check one of our starter files: the same rules as anything saved, plus a slug that is its own. */
export function checkCurated(raw: unknown): CuratedStarter {
  const r = (raw ?? {}) as Partial<CuratedStarter>;
  const slug = (r.slug ?? "").trim();
  if (!slug || slug !== slugify(slug) || RESERVED.has(slug)) refuse(`"${slug}" isn't a slug we can use.`);
  const content = normalizeStarterContent(r.content);
  const keys = [...content.circles.flatMap((c) => c.questions), ...content.openQuestions].map((q) => q.key);
  const given = [...(r.content?.circles ?? []).flatMap((c) => c.questions), ...(r.content?.openQuestions ?? [])].map((q) => q.key);
  // Keys are lineage: ours are written by hand and must not change between loads.
  if (keys.join() !== given.join()) refuse(`${slug}: every question needs its own key.`);
  return { slug, title: cleanTitle(r.title ?? ""), summary: cleanSummary(r.summary ?? ""), content };
}

/** Load our starters into the library: added, or brought up to date by slug. Never touches anyone else's. */
export async function loadCurated(db: DB, list: unknown[], now = new Date()): Promise<{ added: string[]; updated: string[] }> {
  const checked = list.map(checkCurated);
  const out = { added: [] as string[], updated: [] as string[] };
  for (const c of checked) {
    const existing = await starterBySlug(db, c.slug);
    if (existing && existing.authorId !== null) refuse(`${c.slug} is taken by someone's own starter.`);
    if (existing) {
      await db.update(starters).set({ title: c.title, summary: c.summary, content: c.content, updatedAt: now }).where(eq(starters.id, existing.id));
      out.updated.push(c.slug);
    } else {
      await db.insert(starters).values({
        id: newId(), slug: c.slug, title: c.title, summary: c.summary, authorId: null, visibility: "published",
        content: c.content, createdAt: now, updatedAt: now, publishedAt: now,
      });
      out.added.push(c.slug);
    }
  }
  return out;
}
