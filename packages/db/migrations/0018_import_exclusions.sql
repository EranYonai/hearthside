CREATE TABLE IF NOT EXISTS "import_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL CONSTRAINT "import_exclusions_household_id_households_id_fk" REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action,
	"account_id" uuid NOT NULL CONSTRAINT "import_exclusions_account_id_accounts_id_fk" REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action,
	"dedup_key" text NOT NULL,
	"created_by" uuid CONSTRAINT "import_exclusions_created_by_members_id_fk" REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "import_exclusions_dedup_idx" ON "import_exclusions" USING btree ("account_id","dedup_key");
