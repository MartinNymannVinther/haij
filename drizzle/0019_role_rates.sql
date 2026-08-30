CREATE TABLE "role_rates" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"org_id" text NOT NULL,
	"role_id" text NOT NULL,
	"company_id" text,
	"project_id" text,
	"hourly_rate_oere" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_rates_scope_valid" CHECK ((company_id is not null) <> (project_id is not null)),
	CONSTRAINT "role_rates_rate_valid" CHECK (hourly_rate_oere >= 0)
);
--> statement-breakpoint
ALTER TABLE "role_rates" ADD CONSTRAINT "role_rates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_rates" ADD CONSTRAINT "role_rates_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_rates" ADD CONSTRAINT "role_rates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_rates" ADD CONSTRAINT "role_rates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "role_rates_role_company_uq" ON "role_rates" USING btree ("role_id","company_id") WHERE company_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "role_rates_role_project_uq" ON "role_rates" USING btree ("role_id","project_id") WHERE project_id is not null;--> statement-breakpoint
CREATE INDEX "role_rates_org_company_idx" ON "role_rates" USING btree ("org_id","company_id");--> statement-breakpoint
CREATE INDEX "role_rates_org_project_idx" ON "role_rates" USING btree ("org_id","project_id");--> statement-breakpoint
ALTER TABLE "roles" DROP COLUMN "hourly_rate_oere";