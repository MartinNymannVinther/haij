-- Tenancy enforcement for the feedback round: roles and org_logos.
-- Model per ADR 0002/0003. org_logos deliberately gets NO audit row
-- trigger: the trigger snapshots whole rows and would copy the base64
-- image into audit_log on every change. The service writes a semantic
-- 'org_logos.updated'/'org_logos.deleted' audit event instead.

GRANT SELECT, INSERT, UPDATE, DELETE ON "roles", "org_logos" TO haij_app;
--> statement-breakpoint

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_logos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_logos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY app_all_roles ON "roles" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_all_org_logos ON "org_logos" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint

CREATE TRIGGER audit_roles
  AFTER INSERT OR UPDATE OR DELETE ON "roles"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
