-- MCP API keys: RLS + audit, plus the one auth-shaped exception in the
-- domain: resolving a bearer key happens BEFORE any org context exists,
-- exactly like a login. The auth role therefore gets read access to
-- api_keys (and may stamp last_used_at) - the same reasoning that gives
-- Better Auth its role, documented in ADR 0006. The key hash joins the
-- blanket audit redaction list.

GRANT SELECT, INSERT, UPDATE, DELETE ON "api_keys" TO haij_app;
--> statement-breakpoint
GRANT SELECT, UPDATE (last_used_at, updated_at) ON "api_keys" TO haij_auth;
--> statement-breakpoint

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY app_all_api_keys ON "api_keys" FOR ALL TO haij_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY auth_read_api_keys ON "api_keys" FOR SELECT TO haij_auth
  USING (true);
--> statement-breakpoint
CREATE POLICY auth_touch_api_keys ON "api_keys" FOR UPDATE TO haij_auth
  USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE TRIGGER audit_api_keys
  AFTER INSERT OR UPDATE OR DELETE ON "api_keys"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION audit_redact(data jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN data IS NULL THEN NULL
    ELSE data - ARRAY[
      'password', 'token', 'secret', 'backup_codes',
      'access_token', 'refresh_token', 'id_token', 'value',
      'key_hash'
    ]
  END
$$;
