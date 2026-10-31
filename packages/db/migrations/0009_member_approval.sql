ALTER TABLE "members" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
-- Everyone already in the household stays in; only new joiners wait for approval.
UPDATE "members" SET "approved_at" = "created_at" WHERE "approved_at" IS NULL;
