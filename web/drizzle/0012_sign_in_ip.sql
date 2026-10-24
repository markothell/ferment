-- Who asked for each sign-in link, so one asker can't use up the caps for
-- someone else's address or for everyone new (lib/access.ts). Additive: code
-- that doesn't know the column ignores it.
ALTER TABLE "sign_in_requests" ADD COLUMN "ip" text;--> statement-breakpoint
CREATE INDEX "sign_in_requests_ip_created_at_index" ON "sign_in_requests" USING btree ("ip","created_at");