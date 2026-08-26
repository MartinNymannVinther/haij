# ADR 0001: Phase-0 stack

Status: accepted · Date: 2026-08-26

## Decision

Modular monolith on Next.js 16 (App Router) with strict TypeScript.
Postgres 16 with Drizzle ORM and checked-in SQL migrations. Better Auth
(with the organization, passkey and two-factor plugins) for authentication.
Tailwind 4 + shadcn/ui (Base UI, nova preset) for UI. next-intl for i18n
(`da` default without URL prefix, `en` under `/en`). zod at every input
boundary. Vitest for tests, `pg` (node-postgres) as the driver, pnpm as the
package manager. Deployment as Docker Compose via Coolify on an EU VPS.

## Rationale and trade-offs accepted

- **Monolith over services.** One deployable, one database. Limits
  independent scaling — accepted: the target customer is a 1–20 person
  firm, and module boundaries in `src/modules` keep a later split possible.
- **Better Auth over hand-rolled auth.** Passkeys, TOTP, organizations and
  rate limiting come tested out of the box; hand-rolling those is where
  security projects die. Accepted trade-offs: a fast-moving dependency
  (1.7 renamed things and added `accounts.issuer`; the schema is verified
  against the runtime's `getAuthTables`, not the CLI), and its tables are
  owned by the library rather than fully shaped by us.
- **Drizzle + checked-in SQL.** RLS policies, roles and triggers are
  first-class SQL migrations reviewed like code. Accepted: two custom
  migrations are hand-written SQL that drizzle-kit does not validate.
- **pnpm.** Faster installs/CI and strict dependency resolution. Accepted:
  contributors must `corepack enable` first.
- **No email verification in phase 0.** There is deliberately no email
  provider before phase 2 (it must be an EU provider behind an adapter),
  so signup does not verify addresses yet. Accepted as a known gap;
  revisit when the email adapter lands.
- **pg-boss deferred.** The constitution names it for background jobs;
  phase 0 has no jobs, so it is not installed yet.
