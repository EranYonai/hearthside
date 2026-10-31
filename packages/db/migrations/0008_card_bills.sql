ALTER TABLE "transactions" ADD COLUMN "card_bill" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "card_bill_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "card_bill_expected_minor" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_bill_account_id_accounts_id_fk" FOREIGN KEY ("card_bill_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_bill_check" CHECK ("transactions"."card_bill" in ('amount', 'name'));