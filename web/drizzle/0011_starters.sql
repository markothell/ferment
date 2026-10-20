CREATE TYPE "public"."starter_visibility" AS ENUM('private', 'published');--> statement-breakpoint
CREATE TABLE "sign_in_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"new_account" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "starters" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"author_id" text,
	"visibility" "starter_visibility" DEFAULT 'private' NOT NULL,
	"forked_from_id" text,
	"forked_from_title" text,
	"made_from_gathering_id" text,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	CONSTRAINT "starters_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "gatherings" ADD COLUMN "starter_id" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "starter_id" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "starter_key" text;--> statement-breakpoint
ALTER TABLE "starters" ADD CONSTRAINT "starters_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starters" ADD CONSTRAINT "starters_forked_from_id_starters_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."starters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starters" ADD CONSTRAINT "starters_made_from_gathering_id_gatherings_id_fk" FOREIGN KEY ("made_from_gathering_id") REFERENCES "public"."gatherings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sign_in_requests_email_created_at_index" ON "sign_in_requests" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "sign_in_requests_new_account_created_at_index" ON "sign_in_requests" USING btree ("new_account","created_at");--> statement-breakpoint
CREATE INDEX "starters_visibility_index" ON "starters" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "starters_author_id_index" ON "starters" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "starters_forked_from_id_index" ON "starters" USING btree ("forked_from_id");--> statement-breakpoint
CREATE INDEX "starters_made_from_gathering_id_index" ON "starters" USING btree ("made_from_gathering_id");--> statement-breakpoint
ALTER TABLE "gatherings" ADD CONSTRAINT "gatherings_starter_id_starters_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_starter_id_starters_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."starters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompts_starter_id_index" ON "prompts" USING btree ("starter_id");