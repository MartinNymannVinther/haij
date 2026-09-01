-- Let the application read Drizzle's own migration journal.
--
-- The About page compares the number of migrations the build was made from
-- with the number the database has applied, which is how a deploy where the
-- container started but the migration step did not becomes visible as a
-- warning rather than as a confusing query error somewhere else entirely.
--
-- Read-only, and on Drizzle's bookkeeping table only: no org_id, no domain
-- data, nothing RLS protects. The application role gains no rights it could
-- use to reach another organization's rows.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_namespace WHERE nspname = 'drizzle') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA drizzle TO haij_app';
    EXECUTE 'GRANT SELECT ON drizzle."__drizzle_migrations" TO haij_app';
  END IF;
END $$;
