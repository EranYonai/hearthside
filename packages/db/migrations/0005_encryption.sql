CREATE TABLE "encryption_keys" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "encryption_keys_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"purpose" text NOT NULL,
	"wrapped" text NOT NULL,
	"master_key_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "encryption_keys_purpose_check" CHECK ("encryption_keys"."purpose" in ('data', 'index'))
);
--> statement-breakpoint
DROP INDEX "accounts_source_idx";--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "detail" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "detail" SET DATA TYPE text USING "detail"::text;--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "payload" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "payload" SET DATA TYPE text USING "payload"::text;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "amount_minor" SET DATA TYPE text USING "amount_minor"::text;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "original_minor" SET DATA TYPE text USING "original_minor"::text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "ip_hash" text;--> statement-breakpoint
-- Existing rows stay plaintext until the app starts: initEncryption() seals them, and hashes
-- the lookup columns (ip_hash starts as a copy of ip for that).
UPDATE "audit_log" SET "ip_hash" = "ip" WHERE "ip" IS NOT NULL;