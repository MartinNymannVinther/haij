# ADR 0008: A closed vocabulary for contact categories

Status: accepted · Date: 2026-08-30

Contacts needed a way to be marked as thought leaders, decision makers and
so on, and to be sorted by it later.

**Fixed set, not free tags.** Seven values, stored in
`CONTACT_CATEGORIES` and enforced by a check constraint:
`decision_maker`, `practitioner`, `door_opener`, `thought_leader`,
`partner`, `former_colleague`, `press`. A contact may carry several.

Free tags were the obvious alternative and were rejected: the whole point
is counting and filtering across every customer, and free tags reliably
decay into three spellings of the same idea. A closed set can also be
translated, coloured and ordered consistently, which free text cannot.
Trade-off accepted: adding a category means a migration. That is the
right friction — a vocabulary that changes casually is not a vocabulary.

**A column, not a table.** `contacts.categories text[]` with a check
constraint rather than a join table. The values are a closed set with no
attributes of their own, so a table would buy nothing and cost a new RLS
policy, a new audit trigger and a new isolation test — real security
surface for no gain. Postgres filters it with `@>` and counts it with
`unnest`, both index-friendly if that ever matters.

The categories are narrowed to `ContactCategory` where they leave the
service layer, so no view has to know the column is plain `text[]`.
