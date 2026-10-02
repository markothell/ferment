CREATE TYPE "public"."circle_color" AS ENUM('saffron', 'clay', 'moss', 'slate', 'plum');--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "color" "circle_color" DEFAULT 'saffron' NOT NULL;