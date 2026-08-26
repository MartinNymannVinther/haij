# ADR 0005: Signals engine — sources, untrusted data, cron before pg-boss

Status: accepted · Date: 2026-08-26

## Decisions

**Sources behind one adapter interface.** Three automatic sources ship
first: CVR events through the same official Virk access the CVR lookup
uses (recently updated companies in branch-code ranges the org picks),
EU tenders through TED's open search API (Denmark as place of
performance plus full-text keywords), and the org's own RSS/Atom feeds
through a small hand-rolled parser. Job postings ride the RSS source
(Jobindex exposes searches as feeds) instead of scraping job boards.
udbud.dk has no public API; Danish tenders above threshold reach TED,
and the adapter interface leaves room for a dedicated source later.
LinkedIn is manual capture only ("gem som signal") — their terms forbid
scraping, so the human brings the signal.

**Everything fetched is untrusted data.** The CLAUDE.md security rule is
implemented mechanically: content is sanitized on ingestion (tags
stripped, entities decoded, control characters removed, length capped),
stored as plain text, and fenced in scoring prompts with an explicit
"data, not instructions" frame. The scoring model gets no tools and its
output is only ever a score, a reason and a suggested next step for a
human. The raw payload is stored per signal as its GDPR source log.

**Scoring is best-effort and bounded.** At most 15 unscored signals are
scored per refresh, so a large fetch can never run away with tokens.
Without an LLM provider or a service profile, signals simply land
unscored — the engine works without AI, AI makes it ranked.

**Cron endpoint now, pg-boss at deployment.** CLAUDE.md names pg-boss
as the background-job choice. Deliberate deviation: until Haij runs on
a server, a half-running daemon in dev is worse than none. Unattended
refresh is a bearer-protected endpoint (`/api/signals/refresh`,
SIGNALS_CRON_SECRET) that any cron can call; it iterates organizations
via the auth role (which owns the organizations table) and runs each
refresh fully RLS-scoped. pg-boss replaces the crontab when the
deployment phase lands.

**Dedupe per (org, source, source_ref).** Each source defines a stable
ref (CVR number, TED publication number, hashed feed GUID), so a
company or notice appears once per org regardless of how often the
fetch runs.

## Trade-offs accepted

CVR events use `sidstOpdateret`, which fires on any register change,
not only foundings — the branch filter plus once-per-org dedupe keeps
the noise acceptable, and the summary shows what changed. TED full-text
keywords are crude next to CPV-code filtering; keywords are what a solo
consultant will actually maintain. The RSS parser handles the common
90% of feeds and ignores exotica by design.
