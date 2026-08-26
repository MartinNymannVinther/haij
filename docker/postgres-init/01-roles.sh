#!/bin/bash
# Creates the two runtime database roles at cluster initialization.
#
# - haij_app:  the application role for all domain queries, fully subject to RLS
# - haij_auth: the role Better Auth uses; only granted access to auth tables
#
# Passwords come from the environment (see docker-compose files). Migrations
# create the roles as NOLOGIN if they are missing, so this script only needs to
# guarantee LOGIN + password. It is idempotent.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'haij_app') THEN
      ALTER ROLE haij_app LOGIN PASSWORD '${HAIJ_APP_PASSWORD:-haij_app}';
    ELSE
      CREATE ROLE haij_app LOGIN PASSWORD '${HAIJ_APP_PASSWORD:-haij_app}';
    END IF;

    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'haij_auth') THEN
      ALTER ROLE haij_auth LOGIN PASSWORD '${HAIJ_AUTH_PASSWORD:-haij_auth}';
    ELSE
      CREATE ROLE haij_auth LOGIN PASSWORD '${HAIJ_AUTH_PASSWORD:-haij_auth}';
    END IF;
  END
  \$\$;
EOSQL
