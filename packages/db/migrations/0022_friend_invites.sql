CREATE TABLE "app_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_for" uuid,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invite_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "server_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_invites" ADD CONSTRAINT "app_invites_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_invites" ADD CONSTRAINT "app_invites_used_for_households_id_fk" FOREIGN KEY ("used_for") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_invites_token_idx" ON "app_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "app_invites_created_by_idx" ON "app_invites" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_requests_email_idx" ON "invite_requests" USING btree ("email_key");--> statement-breakpoint
-- The owner of the first home on this server runs it.
UPDATE "members" SET "server_admin" = true WHERE "id" = (
	SELECT m."id" FROM "members" m JOIN "households" h ON h."id" = m."household_id"
	WHERE m."role" = 'owner' AND m."removed_at" IS NULL
	ORDER BY h."created_at", m."created_at" LIMIT 1
);
