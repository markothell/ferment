// A Prompt is the conversation structure that travels (PLAN §5, "on the
// Prompt"). This is the one gate every prompt passes through, whatever made
// it: the welcome question, a starter circle, a suggestion, an adaptation.
// Limits and defaults are 08's gather rules, kept.

import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { prompts, type Axis } from "@/db/schema";
import { newId } from "@/lib/id";
import { refuse } from "./errors";

export const QUESTION_MAX = 200;
const CONTEXT_MAX = 1000;
const POLE_MAX = 40;
const WORD_MAX = 24;
const SEED_WORDS_MAX = 40;
const PICK = { default: 5, max: 10 };
const COIN = { default: 2, max: 5 };
const SECONDS = { default: 60, min: 15, max: 300 };

export const SHAPES = ["story", "placement", "story_placement", "words"] as const;
export type Shape = (typeof SHAPES)[number];
export type Reveal = "open" | "after_share" | "sealed";

export type PromptInput = {
  question: string;
  context?: string;
  shape?: Shape;
  axes?: Axis[];
  placing?: "free" | "quadrants";
  telling?: "voice" | "text";
  seedWords?: string[];
  pickMax?: number;
  coinMax?: number;
  secondsPerNote?: number;
  reveal?: Reveal;
  /** An adaptation: the prompt this one grew from, in the same gathering (tree). */
  adaptedFromId?: string | null;
};

export type Prompt = typeof prompts.$inferSelect;

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
};

export function wordKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export function cleanWord(raw: string): string {
  const w = raw.trim().replace(/\s+/g, " ");
  if (w.length > WORD_MAX) refuse(`Words are ${WORD_MAX} characters at most.`);
  return w;
}

/** The words of a question: what an edit may change. */
export function cleanWording(input: { question?: string; context?: string }) {
  const question = (input.question || "").trim();
  if (!question) refuse("Write the question.");
  if (question.length > QUESTION_MAX) refuse(`Questions are ${QUESTION_MAX} characters at most.`);
  const context = (input.context || "").trim();
  if (context.length > CONTEXT_MAX) refuse("That context is too long.");
  return { question, context };
}

/** Validate and fill defaults. Returns exactly the columns a prompt stores. */
export function normalizePrompt(input: PromptInput) {
  const { question, context } = cleanWording(input);

  const shape = input.shape ?? "story";
  if (!SHAPES.includes(shape)) refuse("Unknown answer shape.");
  const reveal: Reveal = input.reveal === "open" || input.reveal === "after_share" ? input.reveal : "sealed";

  const places = shape === "placement" || shape === "story_placement";
  const tells = shape === "story" || shape === "story_placement";

  const rawAxes = input.axes ?? [];
  if (!places && rawAxes.length) refuse("Only placement questions have axes.");
  if (places && (rawAxes.length < 1 || rawAxes.length > 2)) refuse("A placement question needs one or two axes.");
  const axes = rawAxes.map((a) => {
    const poleA = (a?.poleA || "").trim();
    const poleB = (a?.poleB || "").trim();
    if (!poleA || !poleB) refuse("Name both ends of each axis.");
    if (poleA.length > POLE_MAX || poleB.length > POLE_MAX) refuse(`Axis ends are ${POLE_MAX} characters at most.`);
    if (poleA.toLowerCase() === poleB.toLowerCase()) refuse("The two ends of an axis must differ.");
    return { poleA, poleB };
  });

  const seedWords: string[] = [];
  let pickMax: number | null = null;
  let coinMax: number | null = null;
  if (shape === "words") {
    const seen = new Set<string>();
    for (const raw of input.seedWords ?? []) {
      const w = cleanWord(raw);
      if (w && !seen.has(wordKey(w))) {
        seen.add(wordKey(w));
        seedWords.push(w);
      }
    }
    if (!seedWords.length) refuse("A words question needs some words to start from.");
    if (seedWords.length > SEED_WORDS_MAX) refuse(`${SEED_WORDS_MAX} starting words at most.`);
    pickMax = clamp(input.pickMax, 1, PICK.max, PICK.default);
    coinMax = clamp(input.coinMax, 0, COIN.max, COIN.default);
  }

  return {
    question, context, shape, axes, reveal, seedWords, pickMax, coinMax,
    placing: places ? (input.placing === "quadrants" && axes.length === 2 ? "quadrants" : "free") : null,
    telling: tells ? (input.telling === "text" ? "text" : "voice") : null,
    secondsPerNote: tells ? clamp(input.secondsPerNote, SECONDS.min, SECONDS.max, SECONDS.default) : null,
  } as const;
}

export async function createPrompt(
  db: DB,
  { rootId, authorId, adaptedFromId = null, ...input }: PromptInput & { rootId: string; authorId: string },
): Promise<Prompt> {
  const values = normalizePrompt(input);
  if (adaptedFromId) {
    const parent = await promptById(db, adaptedFromId);
    if (!parent || parent.rootId !== rootId) refuse("The question you're adapting isn't in this gathering.");
  }
  const [p] = await db.insert(prompts).values({ id: newId(), rootId, authorId, adaptedFromId, ...values }).returning();
  return p;
}

export async function promptById(db: DB, id: string): Promise<Prompt | null> {
  const [p] = await db.select().from(prompts).where(eq(prompts.id, id)).limit(1);
  return p ?? null;
}
