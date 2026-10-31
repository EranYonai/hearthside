ALTER TABLE "transactions" ADD COLUMN "category_via" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_confidence" real;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "transactions_uncategorized_idx" ON "transactions" USING btree ("household_id") WHERE "transactions"."category" is null and "transactions"."category_checked_at" is null;