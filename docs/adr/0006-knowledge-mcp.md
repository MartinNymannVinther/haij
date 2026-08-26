# ADR 0006: Knowledge center and the MCP server

Status: accepted · Date: 2026-08-26

## Knowledge center

Curated RSS sources per organization, deduped article fetches through
the same sanitizing parser as the signals engine, and on-demand AI
digests: the week's items (capped at 25) fenced as untrusted data and
summarized into Danish prose by the LLM adapter. Digests are stored as
plain documents with their item count and model. `knowledge_items`
carries no audit row trigger (technical churn, the ADR 0003 exclusion
pattern); sources and digests are audited.

## MCP server

**Hand-rolled, stateless, small.** `/api/mcp` implements the MCP
JSON-RPC surface an assistant needs — initialize, ping, tools/list,
tools/call — over Streamable HTTP with plain JSON responses, no SSE and
no sessions. The official SDK was deliberately skipped: the endpoint is
~150 lines, fully auditable, and the SDK can replace it if the surface
outgrows this. Batch requests are rejected explicitly.

**Keys act as their creator.** An API key is `haij_` + 40 hex chars,
stored only as a SHA-256 hash (shown once at creation), org-scoped, and
bound to the user who created it. Every MCP call therefore runs as that
user: foreign keys (time entries, created_by) and the audit trail keep
their meaning when an assistant calls in. Revocation is immediate; use
stamps last_used_at; calls are rate-limited in-process at 60/min/key.

**The one auth-shaped exception.** Resolving a bearer key happens
before any org context exists — exactly like a login. The auth role
therefore gets SELECT (and last_used_at UPDATE) on api_keys, mirroring
the reasoning that gives Better Auth its role. The key hash joins the
blanket audit redaction list.

**Drafts only, structurally.** The tool surface exposes reads
(customers, economy, unbilled time, invoices, projects, signals) and
three safe writes: log time, add a task, and create an invoice DRAFT.
There is no tool that issues, sends or deletes anything — the CLAUDE.md
approval rule is enforced by what the API can express, not by prompt
instructions.

## Trade-offs accepted

A hand-rolled MCP endpoint tracks the spec (2025-03-26) manually and
skips streaming; acceptable for a tool server whose responses are small
JSON. Keys bound to a person mean a departing user's keys die with the
account (cascade) — that is the intended behavior for a 1–20 person
firm, not a limitation.
