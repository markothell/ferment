CREATE TYPE "public"."harvest_status" AS ENUM('gathering', 'up', 'down', 'lapsed');--> statement-breakpoint
CREATE TABLE "harvest_choices" (
	"harvest_id" text NOT NULL,
	"user_id" text NOT NULL,
	"share" boolean NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "harvest_choices_harvest_id_user_id_pk" PRIMARY KEY("harvest_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "harvest_items" (
	"harvest_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"transcript" text,
	"audio_url" text,
	"audio_seconds" real,
	"x" real,
	"y" real,
	"words" text[] DEFAULT '{}'::text[] NOT NULL,
	"shared_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "harvest_items_harvest_id_user_id_pk" PRIMARY KEY("harvest_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "harvests" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"circle_id" text NOT NULL,
	"round_id" text NOT NULL,
	"prompt_id" text,
	"proposed_by" text,
	"status" "harvest_status" DEFAULT 'gathering' NOT NULL,
	"question" text NOT NULL,
	"shape" "shape" NOT NULL,
	"axes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answered" integer NOT NULL,
	"closes_at" timestamp NOT NULL,
	"reminded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"up_at" timestamp,
	"down_at" timestamp,
	CONSTRAINT "harvests_roundId_unique" UNIQUE("round_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "harvest_id" text;--> statement-breakpoint
ALTER TABLE "harvest_choices" ADD CONSTRAINT "harvest_choices_harvest_id_harvests_id_fk" FOREIGN KEY ("harvest_id") REFERENCES "public"."harvests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_choices" ADD CONSTRAINT "harvest_choices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_items" ADD CONSTRAINT "harvest_items_harvest_id_harvests_id_fk" FOREIGN KEY ("harvest_id") REFERENCES "public"."harvests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_items" ADD CONSTRAINT "harvest_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_proposed_by_user_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "harvests_community_id_status_index" ON "harvests" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "harvests_circle_id_status_index" ON "harvests" USING btree ("circle_id","status");--> statement-breakpoint
CREATE INDEX "harvests_prompt_id_index" ON "harvests" USING btree ("prompt_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_harvest_id_harvests_id_fk" FOREIGN KEY ("harvest_id") REFERENCES "public"."harvests"("id") ON DELETE cascade ON UPDATE no action;