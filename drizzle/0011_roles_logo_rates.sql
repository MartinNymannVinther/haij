CREATE TABLE "org_logos" (
	"org_id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_logos_type_valid" CHECK (content_type in ('image/png', 'image/jpeg'))
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"hourly_rate_oere" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "hourly_rate_oere" bigint;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "hourly_rate_oere" bigint;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "task_id" text;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "role_id" text;--> statement-breakpoint
ALTER TABLE "org_logos" ADD CONSTRAINT "org_logos_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_name_uq" ON "roles" USING btree ("org_id","name");--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;