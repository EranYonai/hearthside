CREATE TABLE IF NOT EXISTS "recurring_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL CONSTRAINT "recurring_dismissals_household_id_households_id_fk" REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action,
	"payee_key" text NOT NULL,
	"created_by" uuid CONSTRAINT "recurring_dismissals_created_by_members_id_fk" REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recurring_dismissals_payee_idx" ON "recurring_dismissals" USING btree ("household_id","payee_key");
