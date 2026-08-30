ALTER TABLE "companies" ADD COLUMN "invoice_email" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "ean_gln" text;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_ean_format" CHECK (ean_gln is null or ean_gln ~ '^[0-9]{13}$');