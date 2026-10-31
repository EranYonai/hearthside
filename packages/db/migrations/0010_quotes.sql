ALTER TABLE "instruments" ADD COLUMN "quote_symbol" text;--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "prev_close" text;--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "quote_status" text;