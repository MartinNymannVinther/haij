-- Phase 4 tenancy enforcement: RLS + audit for the signals engine,
-- following the model from ADR 0002/0003.

GRANT SELECT, INSERT, UPDATE, DELETE ON "signals", "signal_settings" TO haij_app;
--> statement-breakpoint

ALTER TABLE "signals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "signals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "signal_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "signal_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY app_all_signals ON "signals" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_all_signal_settings ON "signal_settings" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint

-- signals get no row trigger for INSERT storms during fetches? They do:
-- signals are business-meaningful (what did the machine bring in, who
-- dismissed it), and fetch volumes are small for a 1-20 person firm.
CREATE TRIGGER audit_signals
  AFTER INSERT OR UPDATE OR DELETE ON "signals"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_signal_settings
  AFTER INSERT OR UPDATE OR DELETE ON "signal_settings"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
