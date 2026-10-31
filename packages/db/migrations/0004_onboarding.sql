ALTER TABLE "members" ADD COLUMN "display_currency" text DEFAULT 'ILS' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "onboarded_at" timestamp with time zone;