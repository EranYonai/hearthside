ALTER TABLE "accounts" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "network" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "last4" text;--> statement-breakpoint
CREATE INDEX "accounts_source_idx" ON "accounts" USING btree ("owner_id","provider","last4");