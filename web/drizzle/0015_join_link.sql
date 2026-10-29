ALTER TABLE "groups" ADD COLUMN "join_token" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "join_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "via_link" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_joinToken_unique" UNIQUE("join_token");