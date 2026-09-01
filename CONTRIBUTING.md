# Contributing to Haij

Thanks for considering it. Haij is early; the most valuable contributions
are focused ones.

## Ground rules

Read [CLAUDE.md](CLAUDE.md) first — it is the project constitution and its
non-negotiables (EU sovereignty, security by design, Danish law as the
default, AGPL-3.0) are not up for debate in PRs. Significant decisions are
recorded as ADRs in `docs/adr/`; if your change alters a decision, it needs
a new ADR that names the trade-off.

## Practicalities

- Node 22+, pnpm. `pnpm install`, dev database via
  `docker compose -f docker-compose.dev.yml up -d`, then `pnpm db:migrate`.
- Conventional commits (`feat(scope): ...`, `fix: ...`, `test: ...`).
- Code, comments and docs in English. UI copy in Danish first
  (`messages/da.json`) with an English translation (`messages/en.json`);
  never hardcode UI strings.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check` and `pnpm test` must
  all pass; CI enforces them plus a dependency audit and secrets scan.
- `pnpm test` drops and rebuilds the whole schema, which is how a fresh
  checkout is proven to migrate from zero. It never touches the database
  in your `.env`: every connection URL is rewritten to a `_test` sibling
  (`haij` becomes `haij_test`), created on first run, and the suite
  refuses to start if the target is not clearly a test database. Point it
  somewhere else with `TEST_MIGRATION_DATABASE_URL`,
  `TEST_APP_DATABASE_URL` and `TEST_AUTH_DATABASE_URL` — the same guard
  applies to those.

## Versions

The running app names itself in the foot of the sidebar and in full under
Indstillinger → Om, as `<version>+<commit>`: the semver from `package.json`
and the commit it was built from. Both are resolved in `next.config.ts` and
inlined at build time, because a container has no git checkout and a version
looked up at runtime is a version that can lie.

- Raise `version` in `package.json` by hand when a step is worth naming.
  Nothing else needs touching.
- Container builds must pass `HAIJ_COMMIT` (and ideally `HAIJ_BUILT_AT`) as
  build arguments — `.dockerignore` excludes `.git`, so without them the app
  honestly reports `unknown` rather than guessing. `docker-compose.yml`
  forwards both from the environment.
- `GET /api/version` answers the same release without a login, so a deploy
  can be verified from outside. It deliberately says nothing about _this_
  installation; `/api/health` still answers only `ok`.

## The tenancy checklist (every new table)

1. `org_id` column on every domain table, RLS **enabled and forced**, with
   policies for `haij_app` scoped by `app_current_org_id()`.
2. Least-privilege grants — nothing gets broad access by default.
3. An `audit_row_change()` trigger unless the table is technical/high-churn
   (document the exception in an ADR).
4. Isolation tests in `tests/rls/` proving org A cannot read or write org
   B's rows. The meta-test fails any table that forgets RLS, but write the
   explicit tests anyway.
5. Never weaken tenancy, auth or audit logging to make a feature easier.

## Security

Vulnerabilities go to [SECURITY.md](SECURITY.md), not the issue tracker.
