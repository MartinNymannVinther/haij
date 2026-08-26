# ADR 0004: Invoicing — øre integers, gapless numbers, database immutability

Status: accepted · Date: 2026-08-26

## Decisions

**Integer money.** Amounts are stored and computed as integer øre,
quantities as integer hundredths, VAT rates as basis points. Rounding is
half away from zero, per line, so a credit note that negates its
invoice's quantities mirrors it øre for øre. Totals are sums of the
stored line amounts — the same per-line convention Dinero and e-conomic
use, so pushed figures will match. No float ever touches a stored amount.

**Gapless sequential numbers.** The fakturakrav require fortløbende
numbering. A Postgres sequence leaves holes on rollback, so numbers come
from a per-organization counter row (`invoice_counters`) upserted inside
the issuing transaction. The row lock serializes concurrent issuance; a
rolled-back issue hands its number out again. Credit notes draw from the
same series.

**Issue freezes the document.** Issuing happens in one transaction:
allocate the number, stamp invoice/delivery/due dates, snapshot buyer
(from the company) and seller (from the org profile) onto the invoice
row, compute totals. From then on the invoice is a bookkeeping document
(bogføringsloven), and the database itself refuses changes: triggers
allow only the status flow `issued -> sent -> paid` (skipping `sent` is
allowed, going backwards is not) and its timestamps, block DELETE, and
freeze the lines — for every role, superusers included. Corrections are
credit notes with negated quantities, carrying the original's buyer
snapshot. The service-layer checks merely produce friendly errors; the
triggers are the enforcement.

**Peppol-modelled fields, adapter-dispatched.** The invoice carries the
Peppol BIS 3.0-relevant fields (EAN/GLN, buyer reference, per-line unit
codes and VAT categories) so e-invoicing needs no schema change. Actual
dispatch and bookkeeping stay outside Haij per CLAUDE.md: an
`AccountingProvider` interface (Dinero-shaped payload) with a manual
default provider. PDF generation is on-demand behind the session, only
for issued documents, from the frozen snapshots.

**Budget and frames.** Monthly revenue targets live in `budgets`;
realized revenue is computed from issued invoices by invoice date, so
credit notes subtract by themselves. Customer frames (hours and/or
amount) and the customer hourly rate live on `companies`; drafts from
unbilled time price entries at the customer rate with the org default as
fallback, and link each entry to its line so nothing bills twice.

## Exclusions (deliberate)

Reminders and late-payment interest (renteloven) are out of scope for
phase 2 — rates and caps must be verified current before hardcoding, and
the daily-driver flow works without them. The Dinero API integration
itself lands behind the existing interface once credentials/OAuth flow
is designed. Multi-currency stays out (DKK only, column reserved).

## Trade-offs accepted

Per-line VAT rounding can differ by an øre from whole-invoice VAT — it
is the convention Danish accounting systems use, and consistency with
the receiving system beats theoretical precision. The counter-row lock
briefly serializes issuance within one organization — for a 1–20 person
firm that contention is irrelevant, and gaplessness is a legal
requirement, not a preference. Buyer data frozen at issue means later
company edits do not touch old invoices — that is the point.
