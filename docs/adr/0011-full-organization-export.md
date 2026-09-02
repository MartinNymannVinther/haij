# ADR 0011: Full organization export

Status: accepted · Date: 2026-09-02

Non-negotiable value 1 says exit cost is a design requirement and that full
data export per organization is a first-class feature. This is that feature.

## Two formats, one collection

The same rows are collected once and written twice. The spreadsheet has one
tab per kind of thing and is meant for people: an accountant, a bank, or
Martin looking for something without a query. The JSON keeps every id, so
the links between an invoice, its lines and the hours behind them survive
the trip — that is the file that makes leaving Haij possible rather than
merely painful.

Trade-off accepted: two output paths to keep in step. Cheap, because both
read the same `ExportSection[]`, and a format that drifts from the other
shows up as a difference in row counts.

## It reads through the ordinary guarded path

The export runs as the application role inside `withOrgContext`, exactly
like every other query in the system. It is not a privileged reader that
happens to be shaped like a feature.

This matters more here than anywhere else: a tenancy mistake in a list view
leaks a page of rows, and the same mistake here hands one organization the
entire business of another in a single downloadable file. So the isolation
test is written first and asks the hostile question — can org A's export
contain org B's data — against two organizations whose rows are deliberately
easy to tell apart.

## The table list is written by hand

`EXPORT_TABLES` names every table and the order of the tabs. It would have
been less code to walk the schema, and it would have been wrong twice: it
would carry credentials out of the system, and it would silently start
including whatever table someone adds next.

Trade-off accepted: a new table has to be added to the list, or it is
missing from the export. That is the same discipline the tenancy checklist
already asks for, and a test proves every entry names a real table and a
real sort column — three of them did not, on the first attempt.

## Redaction is aligned with the audit trigger, not invented here

The audit log is exported too, and it contains copies of rows as they were
written. So an export can only be as clean as the audit trigger's own
redaction: redacting a column in the export while the trigger writes it into
`after_data` is a rule that only looks like a rule.

The API key hash is redacted in both places. The key prefix is redacted in
neither: it is a label, shown in Haij's own key list so a person can tell one
key from another. A test asserts the hash appears nowhere in the export,
including inside the audit trail, because that second place is the one that
is easy to forget.

Left out entirely: the organization's logo, because image bytes do not
belong in a spreadsheet cell, and everything Better Auth owns — sessions,
accounts, passkeys, two-factor secrets — which are credentials rather than
business records. The people are exported from the organization's own
membership instead.

## Deliberately not a backup

An export can be read but not restored, and it is only as fresh as the
moment someone pressed the button. The page says so in as many words,
because the failure mode of believing otherwise is losing everything while
feeling covered. Recovery is the nightly encrypted dump's job (see
`docs/deploy.md`), and the two are not substitutes.

## Recorded when it happens

Taking a complete copy of an organization out of the system writes an
`org.exported` event with the actor and the row count. The audit log should
be able to answer when the data last left and who took it.
