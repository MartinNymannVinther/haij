# Haij

Haij ([haij.dk](https://haij.dk)) is an open source business platform for
solo consultants and micro-businesses. It is Danish-first: CVR lookups,
fakturakrav, moms and Peppol e-invoicing are the defaults, not plugins.
It is EU-sovereign by design — every byte lives on EU-owned infrastructure,
everything runs in Docker, and leaving for another provider is a one-day
job, not a migration project. It is secure by design: multi-tenant
isolation is enforced in the database with Postgres RLS, every mutation
lands in an append-only audit log, and passkeys + TOTP work from day one.
And it is AI-native: built so an assistant can safely draft, summarize and
spot opportunities — while a human approves everything that leaves the house.

The project constitution — values, architecture and rules — lives in
[CLAUDE.md](CLAUDE.md). Decisions and their trade-offs live in
[docs/adr](docs/adr/).

## Status

Early, and in real use. Haij runs one consultancy's daily business —
customers, hours, invoices, books handed to the accountant — on a single
self-hosted installation. That is the whole user base today, and it is
the point: the software is shaped by being used for real before it is
shaped by being used by many.

What that means for you: the code is public and you are welcome to run
it, read it, report what you find and send changes. There is no hosted
signup — the instance at app.haij.dk is closed — so running Haij means
running it yourself. Before 1.0 a migration may still change its mind,
and an upgrade may occasionally ask something of you; the export in
Indstillinger → Data is there so nothing is ever locked in.

Much of the code is written together with Claude Code, under the rules in
[CLAUDE.md](CLAUDE.md). Every change is reviewed, tested and deployed by a
person; the tests for tenancy isolation, invoice math and numbering are
the parts of the codebase that are trusted least to good intentions.

## Quickstart

Requirements: Node 22+, pnpm 10+ (`brew install pnpm`; newer Node builds no longer bundle corepack), Docker.

```bash
git clone https://github.com/MartinNymannVinther/haij.git && cd haij
pnpm install
cp .env.example .env                            # defaults work for local dev
docker compose -f docker-compose.dev.yml up -d  # Postgres 16 + runtime roles
pnpm db:migrate                                 # tables, RLS, audit triggers
pnpm dev                                        # http://localhost:3000
```

Register at `/register` — signup creates your user and your organization —
then add a passkey under Indstillinger → Sikkerhed. Registration is closed
by default (`SIGNUP=closed`); an empty installation always lets the first
person in, and the door shuts by itself once that account exists.

```bash
pnpm test        # RLS isolation, invoice math/numbering/immutability, flows
pnpm lint && pnpm typecheck
```

The tests run against the database from the compose file and never call
an AI model or the CVR register, so they pass offline and without keys.

## What works today

CRM (customers via CVR lookup, contacts, pipeline, activity timeline),
time tracking with a weekly view, invoicing (drafts from unbilled time,
gapless numbering, Danish PDF with your logo, credit notes, payment
status), economy (monthly revenue targets, per-customer frames and
consumption), light project management (projects with frames, tasks,
linked time), the signals engine (CVR events, TED tenders, RSS feeds and
manual capture, AI-scored against your service profile), a knowledge
center with AI digests, a full export of everything an organization owns
as a spreadsheet or JSON, and an MCP server so AI assistants can read your
data and draft — never issue — invoices. Invoicing needs your seller data
first (Indstillinger → Virksomhed); AI features need a model
(Indstillinger → AI), and the provider adapter prefers EU-hosted or local
models.

Connect an AI assistant to the MCP server with an API key from
Indstillinger → AI:

```bash
claude mcp add --transport http haij https://<host>/api/mcp \
  --header "Authorization: Bearer haij_..."
```

## Running it for real

[docs/deploy.md](docs/deploy.md) is the deployment guide: Docker Compose
on an EU VPS, with Coolify doing the plumbing. Which third parties can
see data, and what, is listed in
[docs/subprocessors.md](docs/subprocessors.md) — today that is the
hosting provider, the CVR lookup service and the AI provider you choose.

## Contributing and security

[CONTRIBUTING.md](CONTRIBUTING.md) explains how changes are made here:
plan first, vertical slices, tests where they matter, an ADR for every
decision worth arguing about later. Found a security problem? Please
report it privately as described in [SECURITY.md](SECURITY.md) rather
than in a public issue.

License: [AGPL-3.0](LICENSE).
