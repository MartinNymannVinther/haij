-- Phase 5 tenancy enforcement: RLS + audit for the knowledge center.
-- knowledge_items gets no row trigger: technical, high-churn fetch data
-- (the ADR 0003 exclusion pattern); sources and digests are audited.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "knowledge_sources", "knowledge_items", "knowledge_digests"
TO haij_app;
--> statement-breakpoint

ALTER TABLE "knowledge_sources" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "knowledge_sources" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "knowledge_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "knowledge_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "knowledge_digests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "knowledge_digests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY app_all_knowledge_sources ON "knowledge_sources" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_all_knowledge_items ON "knowledge_items" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_all_knowledge_digests ON "knowledge_digests" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint

CREATE TRIGGER audit_knowledge_sources
  AFTER INSERT OR UPDATE OR DELETE ON "knowledge_sources"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_knowledge_digests
  AFTER INSERT OR UPDATE OR DELETE ON "knowledge_digests"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
