// Ferment's own tables — docs/plan/ferment/PLAN.md §8.
//
// Community → circles → rounds, with the Prompt split out as its own record so
// a conversation structure can travel between circles and carry its lineage.
// Rules that must always hold are constraints here, not checks in code: one
// response per member per round, one membership per person per circle.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// ── Enums ──────────────────────────────────────────────────────────────────

export const memberRole = pgEnum("member_role", ["host", "member"]);
export const emailPref = pgEnum("email_pref", ["each", "digest", "off"]);
export const inviteStatus = pgEnum("invite_status", ["pending", "accepted", "revoked"]);
export const circleStatus = pgEnum("circle_status", ["forming", "active", "idle", "closed", "expired"]);
export const shape = pgEnum("shape", ["story", "placement", "story_placement", "words"]);
export const reveal = pgEnum("reveal", ["open", "after_share", "sealed"]);
export const telling = pgEnum("telling", ["voice", "text"]);
export const placing = pgEnum("placing", ["free", "quadrants"]);
export const roundPhase = pgEnum("round_phase", ["nominated", "queued", "open", "closed", "skipped"]);
export const closedVia = pgEnum("closed_via", ["complete", "timer", "manual"]);
export const transcriptStatus = pgEnum("transcript_status", ["none", "pending", "ready", "failed"]);
export const wordOrigin = pgEnum("word_origin", ["seeded", "coined"]);

const userRef = () => text().references(() => user.id, { onDelete: "cascade" });

// ── Community ──────────────────────────────────────────────────────────────

export const communities = pgTable("communities", {
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  welcomeNote: text().notNull().default(""),
  // Settings (PLAN §2, §5)
  proposalExpiryDays: integer().notNull().default(7),
  membersPostOpenQuestions: boolean().notNull().default(true),
  maxMembers: integer().notNull().default(100),
  createdBy: userRef().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const communityMembers = pgTable(
  "community_members",
  {
    communityId: text()
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: userRef().notNull(),
    role: memberRole().notNull().default("member"),
    invitedBy: text().references(() => user.id, { onDelete: "set null" }),
    // How this member hears about this community (PLAN §7).
    email: emailPref().notNull().default("each"),
    joinedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.communityId, t.userId] })],
);

// An invitation comes from a person and can name a circle (PLAN §4). Only the
// hash of the token is stored; the token itself exists in the email alone.
export const invites = pgTable(
  "invites",
  {
    id: text().primaryKey(),
    communityId: text()
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    email: text().notNull(),
    invitedBy: userRef().notNull(),
    circleId: text().references(() => circles.id, { onDelete: "set null" }),
    note: text().notNull().default(""),
    tokenHash: text().notNull().unique(),
    status: inviteStatus().notNull().default("pending"),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    acceptedAt: timestamp(),
    acceptedBy: text().references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [index().on(t.communityId, t.email)],
);

// ── Circle ─────────────────────────────────────────────────────────────────

export const circles = pgTable(
  "circles",
  {
    id: text().primaryKey(),
    communityId: text()
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    slug: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(""),
    // null = the seat is vacant, and a circle with no host opens nothing new.
    hostId: text().references(() => user.id, { onDelete: "set null" }),
    proposedBy: userRef().notNull(),
    status: circleStatus().notNull().default("forming"),
    // A forming circle that hasn't reached its minimum by this time expires.
    formingExpiresAt: timestamp(),
    // "Start a circle around this" — the prompt it was proposed with.
    originPromptId: text().references((): AnyPgColumn => prompts.id, { onDelete: "set null" }),
    // null = derived: a third of the members, at least 2.
    approvalsToStart: integer(),
    maxLive: integer().notNull().default(3),
    createdAt: timestamp().notNull().defaultNow(),
    formedAt: timestamp(),
    closedAt: timestamp(),
  },
  (t) => [
    uniqueIndex().on(t.communityId, t.slug),
    index().on(t.communityId, t.status),
    check("circles_max_live", sql`${t.maxLive} between 1 and 10`),
  ],
);

export const circleMembers = pgTable(
  "circle_members",
  {
    circleId: text()
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    userId: userRef().notNull(),
    joinedAt: timestamp().notNull().defaultNow(),
    // Leaving keeps the row: what they shared stays named in the record.
    leftAt: timestamp(),
  },
  (t) => [primaryKey({ columns: [t.circleId, t.userId] }), index().on(t.userId)],
);

// ── Prompt: the structure that travels (PLAN §5, "on the Prompt") ──────────

export type Axis = { poleA: string; poleB: string };

export const prompts = pgTable(
  "prompts",
  {
    id: text().primaryKey(),
    communityId: text()
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    authorId: userRef().notNull(),
    adaptedFromId: text().references((): AnyPgColumn => prompts.id, { onDelete: "set null" }),
    question: text().notNull(),
    context: text().notNull().default(""),
    shape: shape().notNull(),
    axes: jsonb().$type<Axis[]>().notNull().default([]),
    placing: placing(),
    telling: telling(),
    seedWords: text().array().notNull().default(sql`'{}'::text[]`),
    pickMax: integer(),
    coinMax: integer(),
    secondsPerNote: integer(),
    reveal: reveal().notNull().default("sealed"),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index().on(t.communityId), index().on(t.adaptedFromId)],
);

// ── Round: one run of a prompt (PLAN §5, "on the Round") ───────────────────

export const rounds = pgTable(
  "rounds",
  {
    id: text().primaryKey(),
    promptId: text()
      .notNull()
      .references(() => prompts.id, { onDelete: "restrict" }),
    communityId: text()
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    // null = an open question to the whole community.
    circleId: text().references(() => circles.id, { onDelete: "cascade" }),
    authorId: userRef().notNull(),
    // Where a suggestion came from, when it was carried over from another round.
    suggestedFromRoundId: text().references((): AnyPgColumn => rounds.id, { onDelete: "set null" }),
    // The round this one answers: a follow-up the whole circle takes a turn on.
    // It sits on that round's branch of the circle map, off the spiral.
    replyToRoundId: text().references((): AnyPgColumn => rounds.id, { onDelete: "cascade" }),
    // Optionally, the one answer it follows up on, quoted at the top.
    replyToResponseId: text().references((): AnyPgColumn => responses.id, { onDelete: "set null" }),
    welcome: boolean().notNull().default(false),
    phase: roundPhase().notNull(),
    timerHours: integer(),
    closesAt: timestamp(),
    editAfterClose: boolean().notNull().default(true),
    reactions: boolean().notNull().default(true),
    createdAt: timestamp().notNull().defaultNow(),
    promotedAt: timestamp(),
    queuedAt: timestamp(),
    openedAt: timestamp(),
    closedAt: timestamp(),
    closedVia: closedVia(),
  },
  (t) => [
    index().on(t.circleId, t.phase),
    index().on(t.communityId, t.phase),
    index().on(t.promptId),
    index().on(t.replyToRoundId),
    check("rounds_reply_not_self", sql`${t.replyToRoundId} is distinct from ${t.id}`),
    check("rounds_reply_in_circle", sql`${t.replyToRoundId} is null or ${t.circleId} is not null`),
    check("rounds_answer_needs_round", sql`${t.replyToResponseId} is null or ${t.replyToRoundId} is not null`),
    // One welcome question per community, and it is always community-wide.
    uniqueIndex("rounds_one_welcome").on(t.communityId).where(sql`${t.welcome}`),
    check("rounds_welcome_is_open_question", sql`not ${t.welcome} or ${t.circleId} is null`),
  ],
);

export const roundSupports = pgTable(
  "round_supports",
  {
    roundId: text()
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    userId: userRef().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.userId] })],
);

// ── Responses ──────────────────────────────────────────────────────────────

export const responses = pgTable(
  "responses",
  {
    id: text().primaryKey(),
    roundId: text()
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    userId: userRef().notNull(),
    text: text().notNull().default(""),
    audioUrl: text(),
    audioSeconds: real(),
    transcript: text(),
    transcriptStatus: transcriptStatus().notNull().default("none"),
    x: real(),
    y: real(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.roundId, t.userId),
    check("responses_x_unit", sql`${t.x} is null or ${t.x} between 0 and 1`),
    check("responses_y_unit", sql`${t.y} is null or ${t.y} between 0 and 1`),
  ],
);

export const reactions = pgTable(
  "reactions",
  {
    responseId: text()
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    userId: userRef().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.responseId, t.userId] })],
);

// The words shape: each round has its own vocabulary, seeded from the prompt's
// list when it opens and grown by what members coin.
export const words = pgTable(
  "words",
  {
    id: text().primaryKey(),
    roundId: text()
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    label: text().notNull(),
    key: text().notNull(),
    origin: wordOrigin().notNull(),
    coinedBy: text().references(() => user.id, { onDelete: "set null" }),
    hidden: boolean().notNull().default(false),
  },
  (t) => [uniqueIndex().on(t.roundId, t.key)],
);

export const responseWords = pgTable(
  "response_words",
  {
    responseId: text()
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    wordId: text()
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.responseId, t.wordId] })],
);

// ── Notifications (PLAN §7) ────────────────────────────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: text().primaryKey(),
    userId: userRef().notNull(),
    communityId: text()
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    circleId: text().references(() => circles.id, { onDelete: "cascade" }),
    roundId: text().references(() => rounds.id, { onDelete: "cascade" }),
    createdAt: timestamp().notNull().defaultNow(),
    readAt: timestamp(),
    emailedAt: timestamp(),
  },
  (t) => [index().on(t.userId, t.readAt), index().on(t.emailedAt)],
);
