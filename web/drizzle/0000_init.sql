CREATE TYPE "public"."circle_status" AS ENUM('forming', 'active', 'idle', 'closed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."closed_via" AS ENUM('complete', 'timer', 'manual');--> statement-breakpoint
CREATE TYPE "public"."email_pref" AS ENUM('each', 'digest', 'off');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('host', 'member');--> statement-breakpoint
CREATE TYPE "public"."placing" AS ENUM('free', 'quadrants');--> statement-breakpoint
CREATE TYPE "public"."reveal" AS ENUM('open', 'after_share', 'sealed');--> statement-breakpoint
CREATE TYPE "public"."round_phase" AS ENUM('nominated', 'queued', 'open', 'closed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."shape" AS ENUM('story', 'placement', 'story_placement', 'words');--> statement-breakpoint
CREATE TYPE "public"."telling" AS ENUM('voice', 'text');--> statement-breakpoint
CREATE TYPE "public"."transcript_status" AS ENUM('none', 'pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."word_origin" AS ENUM('seeded', 'coined');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_members" (
	"circle_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	CONSTRAINT "circle_members_circle_id_user_id_pk" PRIMARY KEY("circle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "circles" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"host_id" text,
	"proposed_by" text NOT NULL,
	"status" "circle_status" DEFAULT 'forming' NOT NULL,
	"forming_expires_at" timestamp,
	"origin_prompt_id" text,
	"approvals_to_start" integer,
	"max_live" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"formed_at" timestamp,
	"closed_at" timestamp,
	CONSTRAINT "circles_max_live" CHECK ("circles"."max_live" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "communities" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"welcome_note" text DEFAULT '' NOT NULL,
	"proposal_expiry_days" integer DEFAULT 7 NOT NULL,
	"members_post_open_questions" boolean DEFAULT true NOT NULL,
	"max_members" integer DEFAULT 100 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "communities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "community_members" (
	"community_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"invited_by" text,
	"email" "email_pref" DEFAULT 'each' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "community_members_community_id_user_id_pk" PRIMARY KEY("community_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"email" text NOT NULL,
	"invited_by" text NOT NULL,
	"circle_id" text,
	"note" text DEFAULT '' NOT NULL,
	"token_hash" text NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"accepted_by" text,
	CONSTRAINT "invites_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"community_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text,
	"circle_id" text,
	"round_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp,
	"emailed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"author_id" text NOT NULL,
	"adapted_from_id" text,
	"question" text NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"shape" "shape" NOT NULL,
	"axes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"placing" "placing",
	"telling" "telling",
	"seed_words" text[] DEFAULT '{}'::text[] NOT NULL,
	"pick_max" integer,
	"coin_max" integer,
	"seconds_per_note" integer,
	"reveal" "reveal" DEFAULT 'sealed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"response_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_response_id_user_id_pk" PRIMARY KEY("response_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "response_words" (
	"response_id" text NOT NULL,
	"word_id" text NOT NULL,
	CONSTRAINT "response_words_response_id_word_id_pk" PRIMARY KEY("response_id","word_id")
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"user_id" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"audio_url" text,
	"audio_seconds" real,
	"transcript" text,
	"transcript_status" "transcript_status" DEFAULT 'none' NOT NULL,
	"x" real,
	"y" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "responses_x_unit" CHECK ("responses"."x" is null or "responses"."x" between 0 and 1),
	CONSTRAINT "responses_y_unit" CHECK ("responses"."y" is null or "responses"."y" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "round_supports" (
	"round_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "round_supports_round_id_user_id_pk" PRIMARY KEY("round_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_id" text NOT NULL,
	"community_id" text NOT NULL,
	"circle_id" text,
	"author_id" text NOT NULL,
	"suggested_from_round_id" text,
	"welcome" boolean DEFAULT false NOT NULL,
	"phase" "round_phase" NOT NULL,
	"timer_hours" integer,
	"closes_at" timestamp,
	"edit_after_close" boolean DEFAULT true NOT NULL,
	"reactions" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"promoted_at" timestamp,
	"queued_at" timestamp,
	"opened_at" timestamp,
	"closed_at" timestamp,
	"closed_via" "closed_via",
	CONSTRAINT "rounds_welcome_is_open_question" CHECK (not "rounds"."welcome" or "rounds"."circle_id" is null)
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"label" text NOT NULL,
	"key" text NOT NULL,
	"origin" "word_origin" NOT NULL,
	"coined_by" text,
	"hidden" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_proposed_by_user_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_origin_prompt_id_prompts_id_fk" FOREIGN KEY ("origin_prompt_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_adapted_from_id_prompts_id_fk" FOREIGN KEY ("adapted_from_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_words" ADD CONSTRAINT "response_words_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_words" ADD CONSTRAINT "response_words_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_supports" ADD CONSTRAINT "round_supports_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_supports" ADD CONSTRAINT "round_supports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_suggested_from_round_id_rounds_id_fk" FOREIGN KEY ("suggested_from_round_id") REFERENCES "public"."rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_coined_by_user_id_fk" FOREIGN KEY ("coined_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circle_members_user_id_index" ON "circle_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "circles_community_id_slug_index" ON "circles" USING btree ("community_id","slug");--> statement-breakpoint
CREATE INDEX "circles_community_id_status_index" ON "circles" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "invites_community_id_email_index" ON "invites" USING btree ("community_id","email");--> statement-breakpoint
CREATE INDEX "notifications_user_id_read_at_index" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_emailed_at_index" ON "notifications" USING btree ("emailed_at");--> statement-breakpoint
CREATE INDEX "prompts_community_id_index" ON "prompts" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "prompts_adapted_from_id_index" ON "prompts" USING btree ("adapted_from_id");--> statement-breakpoint
CREATE UNIQUE INDEX "responses_round_id_user_id_index" ON "responses" USING btree ("round_id","user_id");--> statement-breakpoint
CREATE INDEX "rounds_circle_id_phase_index" ON "rounds" USING btree ("circle_id","phase");--> statement-breakpoint
CREATE INDEX "rounds_community_id_phase_index" ON "rounds" USING btree ("community_id","phase");--> statement-breakpoint
CREATE INDEX "rounds_prompt_id_index" ON "rounds" USING btree ("prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_one_welcome" ON "rounds" USING btree ("community_id") WHERE "rounds"."welcome";--> statement-breakpoint
CREATE UNIQUE INDEX "words_round_id_key_index" ON "words" USING btree ("round_id","key");