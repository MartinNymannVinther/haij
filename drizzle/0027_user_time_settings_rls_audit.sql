-- Tenancy and audit for the per-user time settings, per ADR 0002/0003.
-- The row carries a personal preference, so RLS pins it to the
-- organization and the service pins it to the caller's own user id.

GRANT SELECT, INSERT, UPDATE, DELETE ON "user_time_settings" TO haij_app;
--> statement-breakpoint

ALTER TABLE "user_time_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_time_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY app_all_user_time_settings ON "user_time_settings" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint

-- A membership that ends takes the preference with it: the row belongs to
-- one person inside one organization and means nothing outside it.
CREATE TRIGGER audit_user_time_settings
  AFTER INSERT OR UPDATE OR DELETE ON "user_time_settings"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
