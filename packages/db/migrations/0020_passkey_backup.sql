ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "backup_recipient" text;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "backup_credential_id" text;