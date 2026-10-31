CREATE TABLE "portfolio_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"on" date NOT NULL,
	"value_minor" text NOT NULL,
	"currency" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_account_id_investment_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."investment_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_snapshots_account_day_idx" ON "portfolio_snapshots" USING btree ("account_id","on");--> statement-breakpoint
CREATE INDEX "portfolio_snapshots_household_idx" ON "portfolio_snapshots" USING btree ("household_id","on");