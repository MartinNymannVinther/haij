# ADR 0007: Role rates per customer, and a movable invoice number

Status: accepted · Date: 2026-08-29

## Role rates belong to the customer, not the firm

ADR 0004 gave every role in the catalog one hourly rate for the whole
organization, and put that rate at the top of the resolution chain. That
was wrong in practice: a solo consultant sells the same role at 800 kr.
to one customer and 1.850 kr. to another, so a single number on the role
either lies or has to be worked around on every entry.

The role catalog is now names only. Prices live in `role_rates`, one row
per agreement, bound to **either** one customer **or** one project, never
both and never neither. A partial unique index makes (role, customer) and
(role, project) single rows, so an agreement is edited rather than
stacked, and the history that matters is the audit log.

Resolution, most specific first:

    role rate on the project
      -> role rate on the customer
        -> task -> project -> customer -> org default

A customer agreement now outranks a task rate. What was agreed with the
customer weighs more than a note on one task. A role with no agreement is
just a label on the hour and the price falls through to the ordinary
rates, so nothing ever lands at zero because a rate was forgotten.

**One table, not two.** `company_id` and `project_id` are both nullable
and a check constraint carries the xor. Two tables would have encoded the
invariant in their columns, but every reader — four SQL sites, one editor
component — would then have been written twice. Trade-off accepted: the
constraint does what the type system could have done.

**Three guards, not one.** RLS pins rows to the active org, a `BEFORE`
trigger refuses a rate whose role, customer or project belongs to another
org, and the service does an RLS-scoped existence check before writing.
Foreign keys do not know about tenants, and this is a pricing table.

**No migration of the old rates.** Martin chose to set the agreements up
from scratch (2026-08-29). The column was dropped without moving its
values, so unbilled hours reprice to the customer's ordinary rate until
the agreements exist. Issued invoices are unaffected: they carry their
own frozen unit prices.

## The invoice counter can be moved forward

A business switching to Haij mid-life has already issued invoices
elsewhere. `invoice_counters.next_number` is therefore settable from
company settings, so numbering carries on across the switch instead of
restarting at 1 beside a decade of numbers that already exist.

Forward only. The service refuses a value below `max(invoice_number) + 1`
or below the current counter, and a database trigger refuses any decrease
whatever the caller — a reused number would break the unbroken sequence
bogføringsloven requires, and the unique index would only catch the
collision after the fact.

The counter gets **no** audit row trigger: every issued invoice bumps it,
so a row trigger would write one entry per invoice saying nothing the
invoice's own entry does not. A semantic `invoice_counters.raised` event
is written when a human moves it (the ADR 0003 exclusion pattern, as with
`org_logos`).
