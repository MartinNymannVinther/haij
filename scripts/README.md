# Maintenance scripts

One-off tools, run by hand against a Haij database. None of them is
reachable from the application, and that is the point: each one does
something the running app must refuse to do.

Run them with `pnpm script <fil> [argumenter]`.

## onboard-vinther.ts

Sets up the signals service profile, CVR branch codes, TED keywords and
RSS sources for Vinther Consulting, and imports one customer's history
(hours, agreed rate, issued invoices and their payment dates) from a JSON
file carried over from the previous system.

```
pnpm script scripts/onboard-vinther.ts <org-slug> ~/privat/historik.json --dry-run
pnpm script scripts/onboard-vinther.ts <org-slug> ~/privat/historik.json
```

The history file is real business data about a real customer, so it is
not in the repository and `.gitignore` refuses every JSON file in
`scripts/data/` except `example.json`, which shows the shape with made-up
values. Keep the real file outside the repository folder and point the
script at it.

Idempotent: a second run reports what already exists and creates nothing.
Writes through the ordinary service layer, so RLS, the audit log and the
invoice immutability rules all apply.

## reset-org.ts

Empties one organization's business data so it can be taken into real use
with clean books. Keeps the organization, its members, the company
profile and logo, API keys and the audit log — which records the reset.

```
pnpm script scripts/reset-org.ts <org-slug>            # viser hvad der ryger
pnpm script scripts/reset-org.ts <org-slug> --confirm  # sletter
```

## delete-invoice.ts

Removes one invoice completely and releases the hours it covered back to
unbilled. Winds the counter back when the invoice held the highest
number, so the number is handed out again.

```
pnpm script scripts/delete-invoice.ts <org-slug> <nummer>
pnpm script scripts/delete-invoice.ts <org-slug> <nummer> --confirm
```

## set-password.ts

Sets a password on an existing account.

```
pnpm script scripts/set-password.ts <email>          # spørger, uden ekko
... | pnpm script scripts/set-password.ts <email>    # læser fra stdin
```

For the one situation the application has no way out of: an owner who
signs in only with a passkey, and who needs to reach the same account
from a different origin. Passkeys are bound to the origin they were
created for, by design, so moving an installation from localhost to a real
domain locks a passkey-only owner out of their own system — and there is
no "forgot password" to fall back on, because Haij has no email provider
yet.

It is a script and not a feature because setting someone else's password
outside the login flow is exactly the capability an attacker wants. It
belongs on the machine that already has database credentials.

## grant-owner.ts

Names the installation's owner: the one account that may admit new
organizations (Indstillinger → Adgang).

```
pnpm script scripts/grant-owner.ts                 # viser hvem der har rollen
pnpm script scripts/grant-owner.ts <email>         # giver rollen til den bruger
pnpm script scripts/grant-owner.ts <email> --only  # ... og tager den fra alle andre
```

The first account on an empty installation gets the role by itself, and
the migration that introduced it gave it to the oldest user of an
installation that already existed. That is right for a fresh install and
wrong for a development database full of test users, which is what this
script is for. ADR 0013 explains why it is a script and not a setting.

## Why the destructive ones are scripts and not buttons

An issued invoice is immutable and undeletable inside Haij, enforced by
database triggers, because bogføringsloven wants the number sequence
unbroken: a deleted invoice leaves a hole nobody can explain years later,
and the right answer against real books is a credit note.

Testing and moving in need something the rules forbid. Rather than
softening the rules for everyone, the destructive tools live outside
the application: they connect as the migration role, set
`session_replication_role = replica` for the length of one transaction so
the guards stand down, delete children before parents by hand (that
setting suspends foreign-key cascades too), and write a semantic audit
event afterwards. The setting is session-local, so a crash cannot leave
the database unguarded.

Both refuse to do anything without `--confirm` and then ask you to type
the organization's slug or the invoice number back. If you reach for
either one against real books, stop and issue a credit note instead.
