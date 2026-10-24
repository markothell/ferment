-- The pinned question (docs/plan/ferment/GROUPS.md §5) replaces the welcome
-- question. A gathering's welcome round becomes its pinned round, an ordinary
-- open question to everyone from here on. A starter design that still has a
-- welcome question of its own gets it as the first of its questions to
-- everyone, a story told by voice on an open wall, as the welcome question was.
ALTER TABLE "groups" ADD COLUMN "pinned_round_id" text;--> statement-breakpoint
UPDATE "groups" g SET "pinned_round_id" = r."id" FROM "rounds" r WHERE r."root_id" = g."id" AND r."welcome";--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_pinned_round_id_rounds_id_fk" FOREIGN KEY ("pinned_round_id") REFERENCES "public"."rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" DROP CONSTRAINT "rounds_welcome_is_open_question";--> statement-breakpoint
DROP INDEX "rounds_one_welcome";--> statement-breakpoint
ALTER TABLE "rounds" DROP COLUMN "welcome";--> statement-breakpoint
UPDATE "starters" SET "content" = ("content" - 'welcomeQuestion') || jsonb_build_object(
  'openQuestions',
  jsonb_build_array(
    jsonb_build_object(
      'key', "content"->'welcomeQuestion'->'key',
      'from', coalesce("content"->'welcomeQuestion'->'from', 'null'::jsonb),
      'question', "content"->'welcomeQuestion'->'question',
      'context', '', 'shape', 'story', 'axes', '[]'::jsonb, 'placing', null, 'telling', 'voice',
      'seedWords', '[]'::jsonb, 'pickMax', null, 'coinMax', null, 'secondsPerNote', 60, 'reveal', 'open', 'timerHours', null
    )
  ) || coalesce("content"->'openQuestions', '[]'::jsonb)
)
WHERE jsonb_typeof("content"->'welcomeQuestion') = 'object';--> statement-breakpoint
UPDATE "starters" SET "content" = "content" - 'welcomeQuestion' WHERE "content" ? 'welcomeQuestion';
