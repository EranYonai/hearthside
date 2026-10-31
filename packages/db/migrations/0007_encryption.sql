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
DROP INDEX "household_categories_label_idx";--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "detail" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "detail" SET DATA TYPE text USING "detail"::text;--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "payload" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "payload" SET DATA TYPE text USING "payload"::text;--> statement-breakpoint
ALTER TABLE "household_categories" ALTER COLUMN "keywords" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_categories" ALTER COLUMN "keywords" SET DATA TYPE text USING "keywords"::text;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "amount_minor" SET DATA TYPE text USING "amount_minor"::text;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "original_minor" SET DATA TYPE text USING "original_minor"::text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "ip_hash" text;--> statement-breakpoint
-- Existing rows stay plaintext until the app starts: initEncryption() seals them, and hashes
-- the lookup columns, which start as copies of their source here.
UPDATE "audit_log" SET "ip_hash" = "ip" WHERE "ip" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "household_categories" ADD COLUMN "label_key" text;--> statement-breakpoint
UPDATE "household_categories" SET "label_key" = lower("label");--> statement-breakpoint
ALTER TABLE "household_categories" ALTER COLUMN "label_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "household_categories_label_idx" ON "household_categories" USING btree ("household_id","label_key");