CREATE TABLE IF NOT EXISTS "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"holder_id" uuid,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"lender" text,
	"currency" text DEFAULT 'ILS' NOT NULL,
	"principal_minor" text NOT NULL,
	"rate" text NOT NULL,
	"term_months" integer NOT NULL,
	"start_on" date NOT NULL,
	"payment_minor" text,
	"balance_minor" text,
	"balance_on" date,
	"property_id" uuid,
	"payment_key" text,
	"visibility" text DEFAULT 'household' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loans_kind_check" CHECK ("loans"."kind" in ('mortgage', 'car', 'personal', 'other')),
	CONSTRAINT "loans_visibility_check" CHECK ("loans"."visibility" in ('household', 'private'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"holder_id" uuid,
	"name" text NOT NULL,
	"currency" text DEFAULT 'ILS' NOT NULL,
	"value_minor" text NOT NULL,
	"value_on" date NOT NULL,
	"purchase_minor" text,
	"purchased_on" date,
	"rent_key" text,
	"rent_minor" text,
	"visibility" text DEFAULT 'household' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_visibility_check" CHECK ("properties"."visibility" in ('household', 'private'))
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "loan_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "rent_property_id" uuid;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "loans" ADD CONSTRAINT "loans_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "loans" ADD CONSTRAINT "loans_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "loans" ADD CONSTRAINT "loans_holder_id_members_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "loans" ADD CONSTRAINT "loans_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "properties" ADD CONSTRAINT "properties_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "properties" ADD CONSTRAINT "properties_holder_id_members_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loans_household_idx" ON "loans" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_household_idx" ON "properties" USING btree ("household_id");--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_rent_property_id_properties_id_fk" FOREIGN KEY ("rent_property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_loan_idx" ON "transactions" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_rent_idx" ON "transactions" USING btree ("rent_property_id");