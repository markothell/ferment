CREATE TYPE "public"."seat_status" AS ENUM('waiting', 'admitted', 'declined', 'withdrawn', 'lapsed');--> statement-breakpoint
ALTER TYPE "public"."invite_status" ADD VALUE 'nominated';--> statement-breakpoint
ALTER TYPE "public"."invite_status" ADD VALUE 'declined';--> statement-breakpoint
ALTER TYPE "public"."invite_status" ADD VALUE 'lapsed';--> statement-breakpoint
CREATE TABLE "seat_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"user_id" text,
	"invite_id" text,
	"asked_by" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" "seat_status" DEFAULT 'waiting' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"decided_at" timestamp,
	"decided_by" text,
	CONSTRAINT "seat_for_someone" CHECK (num_nonnulls("seat_requests"."user_id", "seat_requests"."invite_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "seat_supports" (
	"request_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seat_supports_request_id_user_id_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "token_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "confirmed_by" text;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "host_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "invite_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "seat_request_id" text;--> statement-breakpoint
ALTER TABLE "seat_requests" ADD CONSTRAINT "seat_requests_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_requests" ADD CONSTRAINT "seat_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_requests" ADD CONSTRAINT "seat_requests_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_requests" ADD CONSTRAINT "seat_requests_asked_by_user_id_fk" FOREIGN KEY ("asked_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_requests" ADD CONSTRAINT "seat_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_supports" ADD CONSTRAINT "seat_supports_request_id_seat_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."seat_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_supports" ADD CONSTRAINT "seat_supports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seat_requests_circle_id_status_index" ON "seat_requests" USING btree ("circle_id","status");--> statement-breakpoint
CREATE INDEX "seat_requests_invite_id_index" ON "seat_requests" USING btree ("invite_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_one_waiting_per_person" ON "seat_requests" USING btree ("circle_id","user_id") WHERE "seat_requests"."status" = 'waiting';--> statement-breakpoint
CREATE UNIQUE INDEX "seat_one_per_invite" ON "seat_requests" USING btree ("circle_id","invite_id") WHERE "seat_requests"."status" in ('waiting', 'admitted');--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_seat_request_id_seat_requests_id_fk" FOREIGN KEY ("seat_request_id") REFERENCES "public"."seat_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_community_id_status_index" ON "invites" USING btree ("community_id","status");--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_token_once_sent" CHECK ("invites"."status"::text not in ('pending', 'accepted') or "invites"."token_hash" is not null);--> statement-breakpoint
-- Invitations already sent that named a circle: under the old rule the sender
-- could seat someone, so their seat is already admitted.
INSERT INTO "seat_requests" ("id", "circle_id", "invite_id", "asked_by", "note", "status", "created_at", "expires_at", "decided_at", "decided_by")
SELECT 'seat_' || "invites"."id", "invites"."circle_id", "invites"."id", "invites"."invited_by", '', 'admitted', "invites"."created_at", "invites"."expires_at", "invites"."created_at", "invites"."invited_by"
FROM "invites" WHERE "invites"."circle_id" IS NOT NULL AND "invites"."status"::text = 'pending';
