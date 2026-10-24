-- Groups (docs/plan/ferment/GROUPS.md): a circle and a gathering become two
-- kinds of one thing. Every gathering becomes a root group, every circle a
-- group under it, both membership tables one, and every link follows. Nothing
-- is lost: ids stay, so bookmarks and lineage hold. A circle whose slug
-- collides with another group's (slugs are unique across the site now) gets
-- part of its id appended. Names follow what drizzle-kit would generate.
CREATE TYPE "public"."group_kind" AS ENUM('circle', 'gathering');--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"kind" "group_kind" NOT NULL,
	"parent_id" text,
	"root_id" text NOT NULL,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"color" "circle_color" DEFAULT 'saffron' NOT NULL,
	"created_by" text NOT NULL,
	"host_id" text,
	"status" "circle_status" DEFAULT 'active' NOT NULL,
	"forming_expires_at" timestamp,
	"formed_at" timestamp,
	"closed_at" timestamp,
	"origin_prompt_id" text,
	"approvals_to_start" integer,
	"max_live" integer DEFAULT 3 NOT NULL,
	"max_members" integer DEFAULT 100 NOT NULL,
	"proposal_expiry_days" integer DEFAULT 7 NOT NULL,
	"members_post_open_questions" boolean DEFAULT true NOT NULL,
	"starter_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "groups_slug_unique" UNIQUE("slug"),
	CONSTRAINT "groups_max_live" CHECK ("groups"."max_live" between 1 and 10),
	CONSTRAINT "groups_root_or_child" CHECK (("groups"."parent_id" is null) = ("groups"."root_id" = "groups"."id"))
);
--> statement-breakpoint
CREATE TABLE "members" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"invited_by" text,
	"email" "email_pref" DEFAULT 'each' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"archived_at" timestamp,
	CONSTRAINT "members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
-- Every gathering is a root group.
INSERT INTO "groups" ("id", "slug", "kind", "parent_id", "root_id", "name", "note", "created_by", "status", "max_members", "proposal_expiry_days", "members_post_open_questions", "starter_id", "created_at")
SELECT "id", "slug", 'gathering', NULL, "id", "name", "welcome_note", "created_by", 'active', "max_members", "proposal_expiry_days", "members_post_open_questions", "starter_id", "created_at"
FROM "gatherings";--> statement-breakpoint
-- Every circle is a group under its gathering. A slug already taken gets part of the circle's id.
INSERT INTO "groups" ("id", "slug", "kind", "parent_id", "root_id", "name", "note", "color", "created_by", "host_id", "status", "forming_expires_at", "formed_at", "closed_at", "origin_prompt_id", "approvals_to_start", "max_live", "created_at")
SELECT c."id",
  CASE WHEN EXISTS (SELECT 1 FROM "groups" g WHERE g."slug" = c."slug")
         OR EXISTS (SELECT 1 FROM "circles" c2 WHERE c2."slug" = c."slug" AND c2."created_at" < c."created_at")
         OR EXISTS (SELECT 1 FROM "circles" c2 WHERE c2."slug" = c."slug" AND c2."created_at" = c."created_at" AND c2."id" < c."id")
       THEN c."slug" || '-' || left(c."id", 6) ELSE c."slug" END,
  'circle', c."gathering_id", c."gathering_id", c."name", c."description", c."color", c."proposed_by", c."host_id", c."status",
  c."forming_expires_at", c."formed_at", c."closed_at", c."origin_prompt_id", c."approvals_to_start", c."max_live", c."created_at"
FROM "circles" c;--> statement-breakpoint
INSERT INTO "members" ("group_id", "user_id", "role", "invited_by", "email", "joined_at", "archived_at")
SELECT "gathering_id", "user_id", "role", "invited_by", "email", "joined_at", "archived_at" FROM "gathering_members";--> statement-breakpoint
INSERT INTO "members" ("group_id", "user_id", "joined_at", "left_at")
SELECT "circle_id", "user_id", "joined_at", "left_at" FROM "circle_members";--> statement-breakpoint
-- Every link moves over before the old tables go.
ALTER TABLE "harvests" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "harvests" ADD COLUMN "to_group_id" text;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "root_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "root_id" text;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "root_id" text;--> statement-breakpoint
ALTER TABLE "seat_requests" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "starters" ADD COLUMN "made_from_group_id" text;--> statement-breakpoint
UPDATE "harvests" SET "group_id" = "circle_id", "to_group_id" = "gathering_id";--> statement-breakpoint
UPDATE "invites" SET "group_id" = "gathering_id";--> statement-breakpoint
UPDATE "notifications" SET "root_id" = "gathering_id", "group_id" = "circle_id";--> statement-breakpoint
UPDATE "prompts" SET "root_id" = "gathering_id";--> statement-breakpoint
UPDATE "rounds" SET "group_id" = coalesce("circle_id", "gathering_id"), "root_id" = "gathering_id";--> statement-breakpoint
UPDATE "seat_requests" SET "group_id" = "circle_id";--> statement-breakpoint
UPDATE "starters" SET "made_from_group_id" = "made_from_gathering_id";--> statement-breakpoint
ALTER TABLE "harvests" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "harvests" ALTER COLUMN "to_group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "root_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prompts" ALTER COLUMN "root_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "root_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "seat_requests" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
-- The old links and tables.
ALTER TABLE "rounds" DROP CONSTRAINT "rounds_reply_in_circle";--> statement-breakpoint
ALTER TABLE "rounds" DROP CONSTRAINT "rounds_welcome_is_open_question";--> statement-breakpoint
ALTER TABLE "harvests" DROP CONSTRAINT "harvests_gathering_id_gatherings_id_fk";--> statement-breakpoint
ALTER TABLE "harvests" DROP CONSTRAINT "harvests_circle_id_circles_id_fk";--> statement-breakpoint
ALTER TABLE "invites" DROP CONSTRAINT "invites_gathering_id_gatherings_id_fk";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_gathering_id_gatherings_id_fk";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_circle_id_circles_id_fk";--> statement-breakpoint
ALTER TABLE "prompts" DROP CONSTRAINT "prompts_gathering_id_gatherings_id_fk";--> statement-breakpoint
ALTER TABLE "rounds" DROP CONSTRAINT "rounds_gathering_id_gatherings_id_fk";--> statement-breakpoint
ALTER TABLE "rounds" DROP CONSTRAINT "rounds_circle_id_circles_id_fk";--> statement-breakpoint
ALTER TABLE "seat_requests" DROP CONSTRAINT "seat_requests_circle_id_circles_id_fk";--> statement-breakpoint
ALTER TABLE "starters" DROP CONSTRAINT "starters_made_from_gathering_id_gatherings_id_fk";--> statement-breakpoint
DROP INDEX "harvests_gathering_id_status_index";--> statement-breakpoint
DROP INDEX "harvests_circle_id_status_index";--> statement-breakpoint
DROP INDEX "invites_gathering_id_email_index";--> statement-breakpoint
DROP INDEX "invites_gathering_id_status_index";--> statement-breakpoint
DROP INDEX "prompts_gathering_id_index";--> statement-breakpoint
DROP INDEX "rounds_circle_id_phase_index";--> statement-breakpoint
DROP INDEX "rounds_gathering_id_phase_index";--> statement-breakpoint
DROP INDEX "seat_requests_circle_id_status_index";--> statement-breakpoint
DROP INDEX "starters_made_from_gathering_id_index";--> statement-breakpoint
DROP INDEX "rounds_one_welcome";--> statement-breakpoint
DROP INDEX "seat_one_waiting_per_person";--> statement-breakpoint
DROP INDEX "seat_one_per_invite";--> statement-breakpoint
ALTER TABLE "harvests" DROP COLUMN "gathering_id";--> statement-breakpoint
ALTER TABLE "harvests" DROP COLUMN "circle_id";--> statement-breakpoint
ALTER TABLE "invites" DROP COLUMN "gathering_id";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "gathering_id";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "circle_id";--> statement-breakpoint
ALTER TABLE "prompts" DROP COLUMN "gathering_id";--> statement-breakpoint
ALTER TABLE "rounds" DROP COLUMN "gathering_id";--> statement-breakpoint
ALTER TABLE "rounds" DROP COLUMN "circle_id";--> statement-breakpoint
ALTER TABLE "seat_requests" DROP COLUMN "circle_id";--> statement-breakpoint
ALTER TABLE "starters" DROP COLUMN "made_from_gathering_id";--> statement-breakpoint
DROP TABLE "circle_members" CASCADE;--> statement-breakpoint
DROP TABLE "circles" CASCADE;--> statement-breakpoint
DROP TABLE "gathering_members" CASCADE;--> statement-breakpoint
DROP TABLE "gatherings" CASCADE;--> statement-breakpoint
-- The new links.
ALTER TABLE "groups" ADD CONSTRAINT "groups_parent_id_groups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_root_id_groups_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_origin_prompt_id_prompts_id_fk" FOREIGN KEY ("origin_prompt_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_starter_id_starters_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "groups_parent_id_status_index" ON "groups" USING btree ("parent_id","status");--> statement-breakpoint
CREATE INDEX "groups_root_id_index" ON "groups" USING btree ("root_id");--> statement-breakpoint
CREATE INDEX "members_user_id_index" ON "members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_to_group_id_groups_id_fk" FOREIGN KEY ("to_group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_root_id_groups_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_root_id_groups_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_root_id_groups_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_requests" ADD CONSTRAINT "seat_requests_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starters" ADD CONSTRAINT "starters_made_from_group_id_groups_id_fk" FOREIGN KEY ("made_from_group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "harvests_to_group_id_status_index" ON "harvests" USING btree ("to_group_id","status");--> statement-breakpoint
CREATE INDEX "harvests_group_id_status_index" ON "harvests" USING btree ("group_id","status");--> statement-breakpoint
CREATE INDEX "invites_group_id_email_index" ON "invites" USING btree ("group_id","email");--> statement-breakpoint
CREATE INDEX "invites_group_id_status_index" ON "invites" USING btree ("group_id","status");--> statement-breakpoint
CREATE INDEX "prompts_root_id_index" ON "prompts" USING btree ("root_id");--> statement-breakpoint
CREATE INDEX "rounds_group_id_phase_index" ON "rounds" USING btree ("group_id","phase");--> statement-breakpoint
CREATE INDEX "rounds_root_id_phase_index" ON "rounds" USING btree ("root_id","phase");--> statement-breakpoint
CREATE INDEX "seat_requests_group_id_status_index" ON "seat_requests" USING btree ("group_id","status");--> statement-breakpoint
CREATE INDEX "starters_made_from_group_id_index" ON "starters" USING btree ("made_from_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_one_welcome" ON "rounds" USING btree ("root_id") WHERE "rounds"."welcome";--> statement-breakpoint
CREATE UNIQUE INDEX "seat_one_waiting_per_person" ON "seat_requests" USING btree ("group_id","user_id") WHERE "seat_requests"."status" = 'waiting';--> statement-breakpoint
CREATE UNIQUE INDEX "seat_one_per_invite" ON "seat_requests" USING btree ("group_id","invite_id") WHERE "seat_requests"."status" in ('waiting', 'admitted');--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_welcome_is_open_question" CHECK (not "rounds"."welcome" or "rounds"."group_id" = "rounds"."root_id");
