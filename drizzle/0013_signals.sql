CREATE TABLE "signal_settings" (
	"org_id" text PRIMARY KEY NOT NULL,
	"service_profile" text,
	"rss_feeds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ted_keywords" text,
	"cvr_branche_prefixes" text,
	"last_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"org_id" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"url" text,
	"published_at" timestamp with time zone,
	"company_cvr" text,
	"company_id" text,
	"status" text DEFAULT 'new' NOT NULL,
	"score" integer,
	"score_reason" text,
	"suggestion" text,
	"scored_at" timestamp with time zone,
	"follow_up_at" date,
	"payload" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signals_source_valid" CHECK (source in ('cvr', 'ted', 'rss', 'manual')),
	CONSTRAINT "signals_status_valid" CHECK (status in ('new', 'saved', 'dismissed')),
	CONSTRAINT "signals_score_valid" CHECK (score is null or score between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "signal_settings" ADD CONSTRAINT "signal_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signals_org_source_ref_uq" ON "signals" USING btree ("org_id","source","source_ref");--> statement-breakpoint
CREATE INDEX "signals_org_status_idx" ON "signals" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "signals_org_followup_idx" ON "signals" USING btree ("org_id","follow_up_at");