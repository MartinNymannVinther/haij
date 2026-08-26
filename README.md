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

## Quickstart

Requirements: Node 22+, pnpm 10+ (`brew install pnpm`; newer Node builds no longer bundle corepack), Docker.

```bash
git clone <repo-url> haij && cd haij
pnpm install
cp .env.example .env                            # defaults work for local dev
docker compose -f docker-compose.dev.yml up -d  # Postgres 16 + runtime roles
pnpm db:migrate                                 # tables, RLS, audit triggers
pnpm dev                                        # http://localhost:3000
```

Register at `/register` — signup creates your user and your organization —
then add a passkey under Indstillinger → Sikkerhed.

```bash
pnpm test        # RLS isolation, invoice math/numbering/immutability, flows
pnpm lint && pnpm typecheck
```

What works today: CRM (customers via CVR lookup, contacts, pipeline,
activity timeline), time tracking with a weekly view, invoicing (drafts
from unbilled time, gapless numbering, Danish PDF, credit notes, payment
status), economy (monthly revenue targets, per-customer frames and
consumption) and light project management (projects with frames, tasks,
linked time). Invoicing needs your seller data first: Indstillinger →
Virksomhed.

Deployment: [docs/deploy.md](docs/deploy.md). Security policy:
[SECURITY.md](SECURITY.md). License: [AGPL-3.0](LICENSE).
