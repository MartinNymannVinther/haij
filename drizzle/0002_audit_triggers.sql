-- Audit logging: database triggers capture before/after for every row
-- mutation, and audit_log is made append-only at the database level.
-- See docs/adr/0003-audit-logging.md.

-- Strips secrets from row images before they enter the audit trail. The key
-- list is deliberately a blanket list applied to every table.
CREATE OR REPLACE FUNCTION audit_redact(data jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN data IS NULL THEN NULL
    ELSE data - ARRAY[
      'password', 'token', 'secret', 'backup_codes',
      'access_token', 'refresh_token', 'id_token', 'value'
    ]
  END
$$;
--> statement-breakpoint

-- Row-change capture. SECURITY DEFINER (owned by the migration superuser)
-- so the insert into audit_log is possible no matter which confined role
-- triggered the change. Actor and org come from the transaction-local
-- context; auth-driven mutations without a context fall back to the row's
-- own organization column and actor_type 'system'.
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org text := nullif(current_setting('app.org_id', true), '');
  v_actor text := nullif(current_setting('app.user_id', true), '');
  v_before jsonb;
  v_after jsonb;
  v_entity_id text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  ELSE
    v_before := to_jsonb(OLD);
  END IF;

  IF v_org IS NULL THEN
    v_org := coalesce(v_after ->> 'organization_id', v_before ->> 'organization_id');
    IF v_org IS NULL AND TG_TABLE_NAME = 'organizations' THEN
      v_org := coalesce(v_after ->> 'id', v_before ->> 'id');
    END IF;
  END IF;

  v_entity_id := coalesce(v_after ->> 'id', v_before ->> 'id');

  INSERT INTO audit_log (
    org_id, actor_user_id, actor_type, action,
    entity_type, entity_id, before_data, after_data
  )
  VALUES (
    v_org,
    v_actor,
    CASE WHEN v_actor IS NULL THEN 'system' ELSE 'user' END,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    v_entity_id,
    audit_redact(v_before),
    audit_redact(v_after)
  );

  RETURN COALESCE(NEW, OLD);
END
$$;
--> statement-breakpoint

-- Append-only enforcement: rejects UPDATE/DELETE/TRUNCATE for every role,
-- superusers included. Grants already withhold UPDATE/DELETE from the
-- runtime roles; this trigger is the backstop.
CREATE OR REPLACE FUNCTION audit_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_block_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_block_mutation();
--> statement-breakpoint

-- Row-change triggers on every business-meaningful table. sessions,
-- verifications and rate_limits are technical, high-churn tables and are
-- excluded; logins/logouts are recorded as semantic events instead
-- (src/core/audit/events.ts). The trade-off is recorded in ADR 0003.
CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON "users"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_accounts
  AFTER INSERT OR UPDATE OR DELETE ON "accounts"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_organizations
  AFTER INSERT OR UPDATE OR DELETE ON "organizations"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_memberships
  AFTER INSERT OR UPDATE OR DELETE ON "memberships"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_invitations
  AFTER INSERT OR UPDATE OR DELETE ON "invitations"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_passkeys
  AFTER INSERT OR UPDATE OR DELETE ON "passkeys"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_two_factors
  AFTER INSERT OR UPDATE OR DELETE ON "two_factors"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
