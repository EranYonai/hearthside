ALTER TABLE "transactions" ADD COLUMN "alert" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "alert_confidence" real;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "alert_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "alert_dismissed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "transactions_alert_pending_idx" ON "transactions" USING btree ("household_id") WHERE "transactions"."alert_checked_at" is null;