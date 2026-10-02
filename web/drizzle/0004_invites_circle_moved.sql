ALTER TABLE "invites" DROP CONSTRAINT "invites_circle_id_circles_id_fk";
--> statement-breakpoint
ALTER TABLE "invites" DROP COLUMN "circle_id";