CREATE TABLE IF NOT EXISTS "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL CONSTRAINT "budgets_household_id_households_id_fk" REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action,
	"category" text NOT NULL,
	"limit_minor" text NOT NULL,
	"updated_by" uuid CONSTRAINT "budgets_updated_by_members_id_fk" REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budgets_category_idx" ON "budgets" USING btree ("household_id","category");
