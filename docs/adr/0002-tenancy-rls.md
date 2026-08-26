# ADR 0002: Multi-tenancy enforced with RLS and two runtime roles

Status: accepted · Date: 2026-08-26

## Decision

Single database, `org_id` on every domain table, row-level security
**enabled and forced** on every table. Two runtime Postgres roles, neither
of which can bypass RLS:

- `haij_app` — all domain queries. Policies key on
  `current_setting('app.org_id')`/`('app.user_id')`, set per transaction by
  `withOrgContext()` from the session's active organization. No setting →
  every predicate is NULL → zero rows: default deny.
- `haij_auth` — Better Auth's own connection pool. Login must look up users
  before any org context exists, so this role has unrestricted policies on
  the auth tables only, insert-only access to `audit_log`, and no grants at
  all on domain tables. Conversely `haij_app` cannot read `accounts`,
  `sessions`, `passkeys`, `two_factors`, `verifications` or `rate_limits` —
  domain code can never touch password hashes, session tokens or TOTP
  secrets.

Migrations run as the Postgres superuser through a third connection string.
`tests/rls/` is the executable specification, including a meta-test that
fails any future table without forced RLS.

## Alternatives rejected

- **App-level filtering only** (WHERE org_id = ...): one forgotten WHERE is
  a data breach. Rejected.
- **Schema- or database-per-tenant**: strong isolation but heavy operations
  (migrations × tenants) for a platform meant to run hosted signups later.
  Rejected for now; RLS gives isolation without the fleet.
- **A single role for app and auth**: would force org-scoped policies to
  coexist with auth's pre-context lookups on the same role, weakening both.
  Rejected.

## Trade-offs accepted

- Domain code must go through `withOrgContext()`. Mitigated by default
  deny: forgetting the helper returns zero rows in dev immediately, rather
  than leaking cross-tenant data.
- `haij_auth` is trusted with all auth tables; Better Auth's own logic is
  the guard there. Its blast radius is capped by having no domain grants.
- Migrations require superuser (the SECURITY DEFINER audit function owner
  must bypass RLS on `audit_log`); acceptable for compose-based deploys
  where the superuser lives next to the database anyway.
- Org-scoped policies key on the session's _active_ organization; a user
  with several organizations sees exactly one at a time. That is a product
  decision as much as a security one.
