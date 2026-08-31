# ADR 0009: Line grouping, draft previews and the time report

Status: accepted · Date: 2026-08-31

## Grouping keeps the total still

An invoice built from a month of daily entries is honest and unreadable.
A draft can now be presented five ways — one line per entry, or collapsed
per project, task, role or month — and the choice is changed on the draft
itself, so the result can be looked at before deciding.

**The grouping key always includes the unit price.** Two hours agreed at
different rates cannot share a line without changing what the invoice
says, so a group spanning two rates becomes two lines. Regrouping never
moves the total by an øre; that is the property the tests hold onto.

**Minutes are summed before conversion**, once per line. Converting each
entry to hundredths and adding the results lets rounding drift a few øre
per line — three twenty-minute entries are exactly one hour, but three
times 0.33 is not.

Order is chronological by the earliest date in each group, with ties
broken by the order the entries arrived. Same-day work keeps the sequence
it was booked in; an invoice that shuffles a day reads as if something
changed.

Regrouping rebuilds the lines from the entries already attached, and only
on drafts. An issued invoice is a document.

## Drafts render as PDFs, marked as drafts

The PDF route used to 404 on drafts, which meant the only way to see what
a customer would receive was to issue it. Drafts render now, and are
marked in the document itself: a large UDKAST stamp across every page and
"Tildeles ved udstedelse" where the number goes.

That marking is the point, not decoration. A draft PDF that reads as an
invoice is one that gets emailed by mistake, and a draft satisfies none of
the fakturakrav. A test extracts the text from the rendered PDF and fails
if the stamp is missing.

## The time report, and a hand-written xlsx writer

Hours can be listed by period, customer, project, role, invoice status
and — the case that matters most — by a specific invoice, which is the
document a customer asks for when they want to see what they paid for.
The report values hours through the same rate hierarchy the invoicing
module uses, and a test asserts a report filtered to one invoice matches
that invoice's net total exactly. A report that disagrees with its own
invoice is worse than no report.

**Excel export is hand-written** (`src/core/xlsx.ts`, ~200 lines): an
xlsx is a ZIP of a few XML parts, and what Haij exports is one flat table
of text, numbers and dates with no formulas. The alternative was a
megabyte of dependency for one table. Trade-off accepted: we own a ZIP
writer and a slice of the OOXML spec. It is held down by tests that unpack
the bytes with an independent reader — which validates the central
directory, the local headers and every CRC — and read the cell values back
out, so "it looks right" is never the evidence.

Dates are written as Excel serials rather than text, and hours as decimals
rather than "7:30", because a recipient opens this to sort and sum it.
