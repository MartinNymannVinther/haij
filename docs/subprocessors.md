# Subprocessors

Per the project constitution, every subprocessor must be EU-owned and
EU-hosted, and must be listed here **before** it is taken into use.

| Subprocessor        | Purpose                                          | Data                                                                                         | Location      | Added      |
| ------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------- | ---------- |
| Hetzner Online GmbH | Hosting: the VPS running Docker and the database | Everything the platform holds                                                                | Nuremberg, DE | 2026-09-01 |
| cvrapi.dk           | CVR lookups when a customer is created           | The CVR number looked up, and the contact address in the User-Agent their terms require      | DK            | 2026-09-01 |
| Mistral AI          | LLM adapter: scoring signals, knowledge digests  | The organization's own service profile, and the title and summary of ingested public signals | Paris, FR     | 2026-09-01 |

## What each one does and does not see

**Hetzner** hosts the machine, so it holds everything by definition: the
database, the backups on their way out, the logs. That is unavoidable for
any hosted deployment and is why the choice of provider matters and why the
exit plan in `docs/deploy.md` is a design requirement rather than a nicety.

**cvrapi.dk** receives a CVR number and returns the company's public
registry data. It never sees customers, invoices or hours. The contact
address travels in the identifying User-Agent their terms require, so they
know which installation asked.

**Mistral** receives what a scoring prompt contains and nothing else: the
organization's service profile, which is a description of the business
written by its owner, and the title and summary of a signal, which is
material already published by a public source. Customers, contacts,
invoices, hours and the audit log are never sent. Signals are treated as
untrusted input and sanitized before the call, which is the
prompt-injection defense, not a privacy measure — both matter, for
different reasons.

## Not subprocessors, but worth naming

**GitHub** holds the source repository. It processes no platform data, so
it is a development dependency rather than a subprocessor, but it is
US-owned and that is worth stating plainly rather than leaving for a reader
to discover. Nothing about the platform's operation depends on it: the
deployment runs from a Docker image, and the repository can be mirrored or
moved without touching production.

**Let's Encrypt** issues the TLS certificate and therefore learns the
hostname, which is public in DNS anyway.

Adding anything to this list is a decision, not a formality. Before a new
row goes in: what data does it receive, could the feature work without
sending it, and what happens to the platform the day that provider
disappears.
