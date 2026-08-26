CREATE TABLE "budgets" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"org_id" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"revenue_target_oere" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_month_valid" CHECK (month between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"org_id" text PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"org_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"quantity_hundredths" integer NOT NULL,
	"unit" text DEFAULT 'hour' NOT NULL,
	"unit_price_oere" bigint NOT NULL,
	"vat_category" text DEFAULT 'standard' NOT NULL,
	"vat_rate_bp" integer DEFAULT 2500 NOT NULL,
	"line_net_oere" bigint NOT NULL,
	"line_vat_oere" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_lines_unit_valid" CHECK (unit in ('hour', 'day', 'piece', 'fixed')),
	CONSTRAINT "invoice_lines_vat_valid" CHECK (vat_category in ('standard', 'zero', 'exempt') and vat_rate_bp between 0 and 10000),
	CONSTRAINT "invoice_lines_quantity_valid" CHECK (quantity_hundredths <> 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"org_id" text NOT NULL,
	"type" text DEFAULT 'invoice' NOT NULL,
	"credited_invoice_id" text,
	"company_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"invoice_number" integer,
	"invoice_date" date,
	"delivery_date" date,
	"due_date" date,
	"payment_terms_days" integer DEFAULT 14 NOT NULL,
	"currency" text DEFAULT 'DKK' NOT NULL,
	"buyer_name" text,
	"buyer_cvr" text,
	"buyer_address" text,
	"buyer_zipcode" text,
	"buyer_city" text,
	"buyer_ean_gln" text,
	"buyer_reference" text,
	"seller_name" text,
	"seller_cvr" text,
	"seller_address" text,
	"seller_zipcode" text,
	"seller_city" text,
	"seller_email" text,
	"seller_phone" text,
	"seller_bank_reg" text,
	"seller_bank_konto" text,
	"note" text,
	"net_oere" bigint DEFAULT 0 NOT NULL,
	"vat_oere" bigint DEFAULT 0 NOT NULL,
	"gross_oere" bigint DEFAULT 0 NOT NULL,
	"issued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_status_valid" CHECK (status in ('draft', 'issued', 'sent', 'paid')),
	CONSTRAINT "invoices_type_valid" CHECK (type in ('invoice', 'credit_note')),
	CONSTRAINT "invoices_issued_have_number" CHECK (status = 'draft' or (invoice_number is not null and invoice_date is not null))
);
--> statement-breakpoint
CREATE TABLE "org_profiles" (
	"org_id" text PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"cvr" text NOT NULL,
	"address" text NOT NULL,
	"zipcode" text NOT NULL,
	"city" text NOT NULL,
	"email" text,
	"phone" text,
	"bank_reg" text,
	"bank_konto" text,
	"default_payment_terms_days" integer DEFAULT 14 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "budget_minutes" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "budget_amount_oere" bigint;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "invoice_line_id" text;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_profiles" ADD CONSTRAINT "org_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_org_year_month_uq" ON "budgets" USING btree ("org_id","year","month");--> statement-breakpoint
CREATE INDEX "invoice_lines_org_invoice_idx" ON "invoice_lines" USING btree ("org_id","invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_org_status_idx" ON "invoices" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "invoices_org_company_idx" ON "invoices" USING btree ("org_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_number_uq" ON "invoices" USING btree ("org_id","invoice_number") WHERE invoice_number is not null;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_invoice_line_id_invoice_lines_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE set null ON UPDATE no action;