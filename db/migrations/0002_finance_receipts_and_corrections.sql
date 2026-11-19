ALTER TABLE "farm_events" ADD COLUMN "effective_sequence" bigint;--> statement-breakpoint
ALTER TABLE "farm_events" ADD COLUMN "replaces_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction_receipts" ADD COLUMN "digest" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "farm_events" ADD CONSTRAINT "farm_events_replaces_id_farm_events_id_fk" FOREIGN KEY ("replaces_id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_single_pending_receipt" ON "transaction_receipts" USING btree ("cash_id") WHERE "transaction_receipts"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "farm_events" ADD CONSTRAINT "farm_events_replaces_id_unique" UNIQUE("replaces_id");--> statement-breakpoint
ALTER TABLE "farm_events" ADD CONSTRAINT "farm_events_replacement_link" CHECK (("farm_events"."replaces_id" is null) = ("farm_events"."effective_sequence" is null) and ("farm_events"."replaces_id" is null or "farm_events"."kind" <> 'reversal'));