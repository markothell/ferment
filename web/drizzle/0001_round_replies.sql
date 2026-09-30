ALTER TABLE "rounds" ADD COLUMN "reply_to_round_id" text;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "reply_to_response_id" text;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_reply_to_round_id_rounds_id_fk" FOREIGN KEY ("reply_to_round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_reply_to_response_id_responses_id_fk" FOREIGN KEY ("reply_to_response_id") REFERENCES "public"."responses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rounds_reply_to_round_id_index" ON "rounds" USING btree ("reply_to_round_id");--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_reply_not_self" CHECK ("rounds"."reply_to_round_id" is distinct from "rounds"."id");--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_reply_in_circle" CHECK ("rounds"."reply_to_round_id" is null or "rounds"."circle_id" is not null);--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_answer_needs_round" CHECK ("rounds"."reply_to_response_id" is null or "rounds"."reply_to_round_id" is not null);