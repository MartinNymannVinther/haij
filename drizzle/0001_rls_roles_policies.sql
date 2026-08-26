-- Multi-tenancy enforcement: runtime roles, least-privilege grants and
-- row-level security on every table. See docs/adr/0002-tenancy-rls.md.
--
-- Roles are created NOLOGIN if missing so this migration is self-contained;
-- provisioning (docker/postgres-init/01-roles.sh, CI, deploy) sets LOGIN and
-- passwords. Migrations must run as a superuser (see docs/deploy.md).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'haij_app') THEN
    CREATE ROLE haij_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'haij_auth') THEN
    CREATE ROLE haij_auth NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO haij_app, haij_auth;
--> statement-breakpoint

-- Better Auth owns the auth tables and is the only writer of them.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "users", "sessions", "accounts", "verifications",
  "organizations", "memberships", "invitations",
  "passkeys", "two_factors", "rate_limits"
TO haij_auth;
--> statement-breakpoint
GRANT INSERT ON "audit_log" TO haij_auth;
--> statement-breakpoint

-- The application role gets narrow read access plus audit inserts. It has
-- deliberately no access at all to accounts, sessions, verifications,
-- passkeys, two_factors or rate_limits: domain code can never touch
-- password hashes, session tokens or TOTP secrets.
GRANT SELECT ON "users", "organizations", "memberships" TO haij_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON "audit_log" TO haij_app;
--> statement-breakpoint

-- Tenant context helpers. current_setting(..., true) returns NULL when the
-- setting is absent, so a missing context matches no rows: default deny.
CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')
$$;
--> statement-breakpoint

-- RLS on, and forced so not even the table owner is exempt (superusers
-- always bypass RLS; no runtime role is a superuser).
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verifications" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "passkeys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "passkeys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "two_factors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "two_factors" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rate_limits" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Better Auth needs unrestricted access to its own tables (login happens
-- before any org context exists). The role is confined by grants instead:
-- it cannot see any domain table.
CREATE POLICY auth_all_users ON "users" FOR ALL TO haij_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_sessions ON "sessions" FOR ALL TO haij_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_accounts ON "accounts" FOR ALL TO haij_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_verifications ON "verifications" FOR ALL TO haij_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_organizations ON "organizations" FOR ALL TO haij_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_memberships ON "memberships" FOR ALL TO haij_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_invitations ON "invitations" FOR ALL TO haij_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_passkeys ON "passkeys" FOR ALL TO haij_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_two_factors ON "two_factors" FOR ALL TO haij_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_rate_limits ON "rate_limits" FOR ALL TO haij_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_insert_audit ON "audit_log" FOR INSERT TO haij_auth WITH CHECK (true);
--> statement-breakpoint

-- Application role policies: a user sees themselves, the organizations they
-- are a member of, and rows belonging to the active organization. Without a
-- context every predicate is NULL and nothing matches.
CREATE POLICY app_select_self ON "users" FOR SELECT TO haij_app
  USING (id = app_current_user_id());
--> statement-breakpoint
CREATE POLICY app_select_memberships ON "memberships" FOR SELECT TO haij_app
  USING (
    user_id = app_current_user_id()
    OR organization_id = app_current_org_id()
  );
--> statement-breakpoint
CREATE POLICY app_select_organizations ON "organizations" FOR SELECT TO haij_app
  USING (
    id = app_current_org_id()
    OR id IN (
      SELECT organization_id FROM "memberships"
      WHERE user_id = app_current_user_id()
    )
  );
--> statement-breakpoint
CREATE POLICY app_select_audit ON "audit_log" FOR SELECT TO haij_app
  USING (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_insert_audit ON "audit_log" FOR INSERT TO haij_app
  WITH CHECK (org_id = app_current_org_id());
