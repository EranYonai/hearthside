ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "balance_minor" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "balance_on" date;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "balance_source" text;