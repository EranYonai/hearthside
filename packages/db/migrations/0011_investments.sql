-- Investments, written to be safe on any database: a fresh one, one that ran this branch's
-- earlier investment migrations (0008-0013 before main took those numbers), or one where a
-- migration was skipped because an older-dated one ran after a newer one. Everything is
-- "if not exists", and columns added in those earlier steps are added again here.
CREATE TABLE IF NOT EXISTS "fx_rates" (
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"on" date NOT NULL,
	"rate" text NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_base_quote_on_pk" PRIMARY KEY("base","quote","on")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"units" text NOT NULL,
	"cost_minor" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "instrument_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"price" text NOT NULL,
	"priced_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"symbol" text NOT NULL,
	"symbol_key" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"asset_class" text NOT NULL,
	"quote_symbol" text,
	"prev_close" text,
	"checked_at" timestamp with time zone,
	"quote_status" text,
	"facts" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instruments_kind_check" CHECK ("instruments"."kind" in ('security', 'cash'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"holder_id" uuid,
	"name" text NOT NULL,
	"provider" text,
	"currency" text DEFAULT 'ILS' NOT NULL,
	"visibility" text DEFAULT 'household' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_accounts_visibility_check" CHECK ("investment_accounts"."visibility" in ('household', 'private'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"instrument_id" uuid,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"units" text,
	"amount_minor" text NOT NULL,
	"currency" text NOT NULL,
	"source" text NOT NULL,
	"dedup_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_transactions_kind_check" CHECK ("investment_transactions"."kind" in ('deposit', 'withdrawal', 'buy', 'sell', 'dividend', 'interest', 'fee', 'tax'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"on" date NOT NULL,
	"value_minor" text NOT NULL,
	"currency" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "invest_settings" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "holdings" ADD CONSTRAINT "holdings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_investment_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."investment_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "holdings" ADD CONSTRAINT "holdings_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "instrument_prices" ADD CONSTRAINT "instrument_prices_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "instruments" ADD CONSTRAINT "instruments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "investment_accounts" ADD CONSTRAINT "investment_accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "investment_accounts" ADD CONSTRAINT "investment_accounts_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "investment_accounts" ADD CONSTRAINT "investment_accounts_holder_id_members_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_account_id_investment_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."investment_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_account_id_investment_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."investment_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "holdings_account_instrument_idx" ON "holdings" USING btree ("account_id","instrument_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdings_household_idx" ON "holdings" USING btree ("household_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "instrument_prices_latest_idx" ON "instrument_prices" USING btree ("instrument_id","priced_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "instruments_symbol_idx" ON "instruments" USING btree ("household_id","symbol_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investment_accounts_household_idx" ON "investment_accounts" USING btree ("household_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investment_transactions_account_date_idx" ON "investment_transactions" USING btree ("account_id","occurred_on");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "investment_transactions_dedup_idx" ON "investment_transactions" USING btree ("account_id","dedup_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portfolio_snapshots_account_day_idx" ON "portfolio_snapshots" USING btree ("account_id","on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_snapshots_household_idx" ON "portfolio_snapshots" USING btree ("household_id","on");
--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN IF NOT EXISTS "quote_symbol" text;
--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN IF NOT EXISTS "prev_close" text;
--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN IF NOT EXISTS "checked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN IF NOT EXISTS "quote_status" text;
--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN IF NOT EXISTS "facts" text;
--> statement-breakpoint
-- Main's 0008-0010, again, in case the runner skipped them (see above).
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "color" text;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE "members" ADD COLUMN "approved_at" timestamp with time zone;
    -- Only when the column is new: everyone already here stays in.
    UPDATE "members" SET "approved_at" = "created_at";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "card_bill" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "card_bill_account_id" uuid;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "card_bill_expected_minor" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_bill_account_id_accounts_id_fk" FOREIGN KEY ("card_bill_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_bill_check" CHECK ("transactions"."card_bill" in ('amount', 'name'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
