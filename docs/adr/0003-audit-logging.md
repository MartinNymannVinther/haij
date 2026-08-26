# ADR 0003: Trigger-based, append-only audit log

Status: accepted · Date: 2026-08-26

## Decision

`audit_log` records who, what, when, org and before/after for every
mutation. Capture is a database trigger (`audit_row_change()`, AFTER
INSERT/UPDATE/DELETE) on every business-meaningful table, so application
code cannot forget it. Actor and org come from the transaction context;
auth-driven writes without a context fall back to the row's own
organization column with `actor_type = 'system'`. A blanket redaction list
strips secrets (`password`, `token`, `secret`, `backup_codes`, OAuth
tokens, verification values) from the stored row images.

Append-only is enforced in the database itself: the runtime roles have no
UPDATE/DELETE grant, and a trigger raises on UPDATE, DELETE and TRUNCATE —
superusers included.

Semantic events that are not row mutations (login, logout) are written
explicitly via `recordAuthEvent()` from Better Auth hooks.

## Exclusions (deliberate)

`sessions`, `verifications` and `rate_limits` have no row triggers: they
are technical, high-churn tables whose business meaning (who logged in,
when) is captured as semantic events instead. Row-auditing `rate_limits`
would write an audit row per authenticated request.

## Trade-offs accepted

- **No foreign keys on `audit_log`.** ON DELETE actions must never be able
  to touch the trail (and append-only would block them anyway). The cost is
  that `org_id`/`actor_user_id` are unconstrained text.
- **Actor granularity.** Better Auth's own writes run without an app
  context, so e.g. `users.insert` at signup is recorded as `system`; the
  adjacent `auth.login` event carries the user. Good enough for phase 0.
- **SECURITY DEFINER + superuser-owned.** The trigger function must insert
  into `audit_log` regardless of which confined role fired it; migrations
  therefore run as superuser (see ADR 0002).
- **GDPR tension.** Audit rows are immutable but may reference personal
  data. Organization data export/deletion (a constitution requirement,
  later phase) must define the audit-log policy explicitly — likely
  crypto-shredding or time-boxed retention. Explicitly deferred, not
  forgotten.
- **Volume.** before/after jsonb duplicates data. Fine at this scale;
  partitioning by month is the known escape hatch.
