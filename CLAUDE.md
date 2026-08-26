# CLAUDE.md — Haij

Haij (haij.dk) is an open source business platform for solo consultants and
micro-businesses. Danish-first, EU-sovereign, AI-native. This file is the
project constitution: read it fully at the start of every session. The
non-negotiables below override any default you would otherwise pick.

## Non-negotiable values

1. **Digital sovereignty.** All infrastructure and subprocessors are EU-owned
   and EU-hosted. Exit cost is a design requirement: everything runs in
   Docker, nothing depends on proprietary cloud services, and full data
   export per organization is a first-class feature. The platform must be
   movable to another EU provider within a day.
2. **Security by design.** Multi-tenant isolation enforced in the database
   (Postgres RLS), OWASP ASVS level 2 as the baseline, append-only audit log
   on every mutation, passkeys + TOTP from day one, no secrets in the repo
   ever.
3. **Danish law as the default.** Bogføringsloven, fakturakrav, moms,
   Peppol/OIOUBL e-invoicing, GDPR. Haij never implements its own ledger:
   bookkeeping lives in a registered Danish accounting system (Dinero,
   e-conomic) reached through an adapter.
4. **AI-native.** API-first, an append-only event log as the shared context
   backbone, an MCP server exposing platform data and actions, and LLM
   access through a provider adapter that prefers EU-hosted models (e.g.
   Mistral) and local/self-hosted endpoints (Ollama-compatible). Any
   outbound action drafted by AI requires explicit human approval.
5. **Open source.** AGPL-3.0. Code, comments and docs in English. UI copy in
   Danish through i18n (`da` default, `en` available).

## Architecture (decided — change only via a new ADR)

- Modular monolith: Next.js (App Router), TypeScript strict.
- Postgres 16+ with Drizzle ORM. Migrations checked in.
- Multi-tenancy: single database, `org_id` on every domain table, RLS
  policies enforced for the application role. App code never uses a
  superuser/bypass role for domain queries.
- Auth: Better Auth with organizations, passkeys (WebAuthn) and TOTP.
  Session cookies: Secure, HttpOnly, SameSite=Lax.
- UI: Tailwind + shadcn/ui. Locale da-DK, timezone Europe/Copenhagen,
  currency DKK (multi-currency later).
- Background jobs: pg-boss (Postgres-backed, no extra infrastructure).
- Deployment: Docker Compose run via Coolify on an EU VPS (Hetzner
  initially; the provider must stay replaceable). Nightly encrypted backups
  to EU object storage. Transactional email through an EU provider behind an
  adapter (decide in phase 2).
- Module layout: `src/modules/{crm,time,invoicing,projects,signals,knowledge}`
  with clear boundaries; shared kernel (auth, tenancy, events, audit) in
  `src/core`. Modules communicate through the core, never through each
  other's tables.
- Trade-off accepted: a monolith limits independent scaling. Fine — the
  target user is a 1–20 person firm, and module boundaries keep a later
  split possible.

## Security rules

- Every new table ships with an RLS policy and an automated test proving org
  A cannot read or write org B's rows.
- Audit log entry (who, what, when, org, before/after) for every mutation.
- Validate all input at the boundary (zod). Parameterized queries only.
- Rate limiting on auth and all public endpoints. Generic auth error
  messages, no stack traces or version info in responses.
- Ingested external content (signals engine, knowledge center) is untrusted
  data: never treated as instructions, always sanitized before any LLM call,
  and AI features reading it get no tool access beyond writing suggestions
  for human review. This is the indirect-prompt-injection defense.
- GDPR by design: per-organization data export and deletion, record of
  processing, EU-only subprocessors listed in `docs/subprocessors.md`.
- `SECURITY.md` with responsible disclosure. CI runs dependency audit and
  secrets scanning on every PR.

## Danish domain knowledge

- Company data: CVR (Det Centrale Virksomhedsregister). Customers are
  created by CVR lookup with autofill.
- Fakturakrav: sequential invoice numbers, issue date, seller and buyer
  incl. CVR, quantity/nature of services, VAT base and 25% moms specified,
  payment terms.
- E-invoicing: Denmark is migrating from OIOUBL to the Peppol document
  family (expected complete around 2029). Model invoices Peppol-first; the
  accounting adapter handles dispatch (incl. EAN/GLN routing for
  public-sector customers) until Haij gets its own access-point
  integration.
- Reminders and late payment (renteloven): rykkergebyr max 100 kr., max 3
  reminders, B2B compensation fee. Implement with the invoicing module and
  verify current rates before hardcoding.
- Bookkeeping compliance stays in the registered system; Haij pushes
  invoices/postings via the adapter and pulls payment status back.

## Ways of working (how Claude Code operates here)

1. Plan first. For every task: present a short plan, the schema changes and
   the API surface, get approval, then implement.
2. Vertical slices. Ship end-to-end features; keep the app deployable at
   every commit.
3. Tests where they matter: domain logic, RLS isolation, invoice numbering
   and VAT math.
4. Conventional commits. Every significant decision gets an ADR in
   `docs/adr/` that names the trade-off accepted, not just the choice.
5. Never weaken tenancy, auth or audit logging to make a feature easier.
6. When Danish law details matter, verify current rules before hardcoding
   numbers or deadlines.
7. Ask before adding any dependency not implied by this file.

## Roadmap

- Phase 0: foundation — repo skeleton, auth, tenancy, audit, CI, deploy.
- Phase 1: CRM (companies via CVR, contacts, pipeline, activity timeline)
  and time tracking.
- Phase 2: invoicing (drafts from time entries, PDF + Peppol-modelled data,
  sending via accounting adapter, payment status) and a simple budget. Haij
  becomes the daily driver here.
- Phase 3: light project management (projects, tasks, linked time entries).
- Phase 4: signals engine — pluggable source adapters: CVR events, job
  postings, udbud.dk/TED tenders, RSS. LinkedIn only via manual "save as
  signal" (their ToS forbids scraping). AI scoring against the org's
  service profile, follow-up scheduling, source log per signal for GDPR.
- Phase 5: knowledge center (curated sources + AI digest) and the MCP
  server (pull earlier if the API surface stabilizes).
- Backlog: proposal → project → invoice flow, client portal, compliance
  calendar (moms deadlines), weekly AI briefing, bank reconciliation via an
  EU PSD2 provider, MitID-verified organizations via a Danish broker,
  hosted multi-tenant signups.
