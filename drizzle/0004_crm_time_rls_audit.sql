-- Phase 1 tenancy enforcement: RLS, grants and audit triggers for the CRM
-- and time-tracking tables. Follows the checklist in CONTRIBUTING.md and
-- the model from ADR 0002/0003.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "companies", "contacts", "activities", "time_entries"
TO haij_app;
--> statement-breakpoint

ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "activities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "time_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "time_entries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- One policy per table: everything is scoped to the active organization,
-- reads and writes alike. No context -> NULL predicate -> zero rows.
CREATE POLICY app_all_companies ON "companies" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_all_contacts ON "contacts" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_all_activities ON "activities" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_all_time_entries ON "time_entries" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint

CREATE TRIGGER audit_companies
  AFTER INSERT OR UPDATE OR DELETE ON "companies"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_contacts
  AFTER INSERT OR UPDATE OR DELETE ON "contacts"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_activities
  AFTER INSERT OR UPDATE OR DELETE ON "activities"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_time_entries
  AFTER INSERT OR UPDATE OR DELETE ON "time_entries"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
