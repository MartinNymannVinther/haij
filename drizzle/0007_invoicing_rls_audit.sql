-- Phase 2 tenancy enforcement + invoice immutability. Follows the
-- CONTRIBUTING.md checklist and the model from ADR 0002/0003; the
-- immutability rules are documented in ADR 0004.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "org_profiles", "invoice_counters", "invoices", "invoice_lines", "budgets"
TO haij_app;
--> statement-breakpoint

ALTER TABLE "org_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice_counters" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice_counters" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice_lines" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "budgets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY app_all_org_profiles ON "org_profiles" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_all_invoice_counters ON "invoice_counters" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_all_invoices ON "invoices" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_all_invoice_lines ON "invoice_lines" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_all_budgets ON "budgets" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint

CREATE TRIGGER audit_org_profiles
  AFTER INSERT OR UPDATE OR DELETE ON "org_profiles"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_invoice_lines
  AFTER INSERT OR UPDATE OR DELETE ON "invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_budgets
  AFTER INSERT OR UPDATE OR DELETE ON "budgets"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint

-- Invoice immutability (bogføringsloven): once an invoice has left draft,
-- only the status flow (issued -> sent -> paid) and its timestamps may
-- change. Everything else - numbers, dates, parties, totals - is frozen,
-- for every role, superusers excepted by Postgres itself.
CREATE OR REPLACE FUNCTION invoices_enforce_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  allowed text[] := ARRAY['status', 'sent_at', 'paid_at', 'updated_at'];
  changed_keys text[];
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;
  SELECT coalesce(array_agg(key), '{}') INTO changed_keys
  FROM (
    SELECT key FROM jsonb_each(to_jsonb(OLD)) o(key, value)
    WHERE to_jsonb(NEW) -> key IS DISTINCT FROM value
  ) diff
  WHERE key <> ALL (allowed);
  IF array_length(changed_keys, 1) > 0 THEN
    RAISE EXCEPTION 'issued invoices are immutable (attempted change of: %)',
      array_to_string(changed_keys, ', ');
  END IF;
  IF NOT (
    (OLD.status = 'issued' AND NEW.status IN ('issued', 'sent', 'paid')) OR
    (OLD.status = 'sent' AND NEW.status IN ('sent', 'paid')) OR
    (OLD.status = 'paid' AND NEW.status = 'paid')
  ) THEN
    RAISE EXCEPTION 'invalid invoice status transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER invoices_immutable
  BEFORE UPDATE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION invoices_enforce_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION invoices_block_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'issued invoices cannot be deleted; issue a credit note instead';
  END IF;
  RETURN OLD;
END
$$;
--> statement-breakpoint
CREATE TRIGGER invoices_no_delete
  BEFORE DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION invoices_block_delete();
--> statement-breakpoint

-- Lines follow their invoice: no insert/update/delete once it left draft.
CREATE OR REPLACE FUNCTION invoice_lines_enforce_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_status text;
  v_invoice_id text;
BEGIN
  v_invoice_id := coalesce(NEW.invoice_id, OLD.invoice_id);
  SELECT status INTO v_status FROM invoices WHERE id = v_invoice_id;
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'lines of issued invoices are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_lines_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION invoice_lines_enforce_immutable();
