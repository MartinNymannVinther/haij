-- Tenancy and audit for role_rates, plus the invoice-counter guard.
-- Model per ADR 0002/0003.

GRANT SELECT, INSERT, UPDATE, DELETE ON "role_rates" TO haij_app;
--> statement-breakpoint

ALTER TABLE "role_rates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "role_rates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY app_all_role_rates ON "role_rates" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint

CREATE TRIGGER audit_role_rates
  AFTER INSERT OR UPDATE OR DELETE ON "role_rates"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint

-- A role rate must point at a company or a project inside the same
-- organization. RLS already pins every row the app can see to one org,
-- but the foreign keys alone would let a crafted insert borrow another
-- org's company id, so the invariant is enforced here as well.
CREATE OR REPLACE FUNCTION role_rates_scope_same_org() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM companies c
       WHERE c.id = NEW.company_id AND c.org_id = NEW.org_id
     ) THEN
    RAISE EXCEPTION 'role rate company % is not in org %', NEW.company_id, NEW.org_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.project_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM projects p
       WHERE p.id = NEW.project_id AND p.org_id = NEW.org_id
     ) THEN
    RAISE EXCEPTION 'role rate project % is not in org %', NEW.project_id, NEW.org_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM roles r
       WHERE r.id = NEW.role_id AND r.org_id = NEW.org_id
     ) THEN
    RAISE EXCEPTION 'role rate role % is not in org %', NEW.role_id, NEW.org_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER role_rates_scope_same_org_check
  BEFORE INSERT OR UPDATE ON "role_rates"
  FOR EACH ROW EXECUTE FUNCTION role_rates_scope_same_org();
--> statement-breakpoint

-- The invoice counter may be raised by hand when a business migrates in
-- from another system and wants its numbering to carry on. It may never
-- be lowered: a reused number would break the unbroken sequence the
-- fakturakrav demand, and the unique index would only catch the collision
-- after the fact.
CREATE OR REPLACE FUNCTION invoice_counters_no_rewind() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.next_number < OLD.next_number THEN
    RAISE EXCEPTION 'invoice counter cannot be lowered from % to %', OLD.next_number, NEW.next_number
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER invoice_counters_no_rewind_check
  BEFORE UPDATE ON "invoice_counters"
  FOR EACH ROW EXECUTE FUNCTION invoice_counters_no_rewind();

-- No row trigger on invoice_counters: every issued invoice bumps it, so a
-- row trigger would write one audit entry per invoice saying nothing the
-- invoice's own entry does not. The service writes a semantic
-- 'invoice_counters.raised' event when a human moves the number instead
-- (same pattern as org_logos, see ADR 0003 exclusions).
