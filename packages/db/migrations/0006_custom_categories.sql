CREATE TABLE "household_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"icon" text NOT NULL,
	"direction" text DEFAULT 'out' NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_categories_direction_check" CHECK ("household_categories"."direction" in ('out', 'in'))
);
--> statement-breakpoint
ALTER TABLE "household_categories" ADD CONSTRAINT "household_categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_categories" ADD CONSTRAINT "household_categories_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "household_categories_slug_idx" ON "household_categories" USING btree ("household_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "household_categories_label_idx" ON "household_categories" USING btree ("household_id",lower("label"));