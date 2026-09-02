-- Admission tables: who may reach them, and the installation's first owner.
--
-- access_requests and access_invitations have no org_id. They describe
-- people who are not users yet and keys that let one address register, so
-- they belong to the installation, like the auth tables, and are handled
-- the same way: the auth role gets them in full, the application role does
-- not get them at all. A tenancy mistake in application code therefore
-- cannot reach them - there is no grant to make the mistake with.

GRANT SELECT, INSERT, UPDATE, DELETE ON "access_requests" TO haij_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "access_invitations" TO haij_auth;
--> statement-breakpoint

ALTER TABLE "access_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "access_requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "access_invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "access_invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY auth_all_access_requests ON "access_requests" FOR ALL TO haij_auth
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_access_invitations ON "access_invitations" FOR ALL TO haij_auth
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- The token hash joins the blanket redaction, so that if a trigger is ever
-- attached to the table the credential still stays out of the audit trail.
CREATE OR REPLACE FUNCTION audit_redact(data jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN data IS NULL THEN NULL
    ELSE data - ARRAY[
      'password', 'token', 'secret', 'backup_codes',
      'access_token', 'refresh_token', 'id_token', 'value',
      'key_hash', 'token_hash'
    ]
  END
$$;
--> statement-breakpoint

-- The installation already running has an owner in every sense but this
-- column: the person who registered first. Name them, once, and only if
-- nobody holds the role yet.
UPDATE "users"
SET "platform_role" = 'owner'
WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC, "id" ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "users" WHERE "platform_role" = 'owner');
