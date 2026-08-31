# ADR 0010: Sending invoices, reminders, and the record of both

Status: proposed · Date: 2026-08-31

Nothing here is built yet. This records the design and, more importantly,
the Danish rules it has to obey — verified against primary sources on
2026-08-31, with the paragraph references needed to check them again in a
year. Amounts and rates in Danish law move; the reasoning below is written
so that the moving parts are identifiable.

## The record is the feature, not the sending

Emailing a PDF is trivial. What is missing the day a customer says they
never received invoice 284 is a place that says when it left, to which
address, with which attachment, and what has happened since.

So the centre of this is an append-only **communication log**: one row per
outbound document, carrying the invoice, the kind (invoice, reminder 1-3,
statement), the recipient address, the timestamp, the rendered document's
checksum, and whatever the provider said in return. Delivery receipts and
bounces are written onto the same row rather than inferred.

It is deliberately **not** the audit log. The audit log is internal, for
Martin and his accountant, and records mutations. This one is
customer-facing evidence and gets shown on the invoice and the customer
page. Trade-off accepted: two append-only logs with some overlap, rather
than one overloaded table whose rows mean two different things.

## Sending goes behind an adapter

Same shape as the accounting adapter: one interface, implementations for
email now, Peppol and the accounting system later. The invoice module
knows it asked for a document to be delivered; it does not know how.

**The provider must be EU-hosted** (non-negotiable value 1). The choice is
open and should be made when this is built, not now.

**Deliverability is the part worth the care.** SPF, DKIM and DMARC on the
sending domain are a precondition, not a nicety: an invoice that lands in
a public authority's spam filter is worse than no sending at all, because
the system will report it as sent. The first implementation should
therefore include a check that the domain's records are in place, and
refuse to send from a domain that fails it.

## Reminders are law, not preference

Renteloven (LBK nr 459 af 13/05/2014) governs this; the amounts sit in
BEK nr 601 af 12/07/2002 as amended. Verified 2026-08-31.

**Reminder fees.** At most 100 kr. per reminder, for at most 3 reminders
concerning the same claim, and only for reminders sent at least 10 days
apart, counted from dispatch (§ 9 b, stk. 2).

**Two traps in that sentence.**

First, the 100 kr. and the count of 3 are _mandatory_ only in consumer
relationships; in business relationships they can be varied by agreement
(§ 9 b, stk. 4). Haij's customers are businesses, so the numbers are
defaults, not hard limits — but they must stay within the "reasonable and
relevant costs" test of § 9 a, stk. 1. Build them as per-customer
configuration with those defaults.

Second, and this is the one that would have been coded wrong: where a
customer has been **continuously in arrears** in an ongoing relationship,
the ceiling of 3 reminders applies to the whole period, not to each
invoice (§ 9 b, stk. 2, 2. pkt.). A reminder counter living on the invoice
— the obvious design — systematically overcharges exactly the customers
who have the most unpaid invoices. **The counter belongs on the customer
relationship.**

**Compensation fee.** 310 kr. per overdue invoice in business
relationships (§ 9 a, stk. 3; BEK nr 601/2002 § 2, stk. 2, as amended by
BEK nr 105/2013). Three properties matter:

- No reminder is required; it falls due as soon as the conditions for
  interest are met.
- It is per invoice, not per customer or per case (U.2016.652Ø).
- It applies to business and public-sector customers only, never
  consumers (BEK 601/2002 § 2, stk. 3), so the code must know the customer
  type. Haij has no consumer customers today; the check still belongs in
  the code rather than in an assumption.

The 310 kr. has been unchanged since 1 March 2013 and is **not indexed**.
Resist the temptation to convert the directive's 40 EUR at today's rate.

**Reminder fees and the compensation fee stack.** Explicit in § 9 a,
stk. 3, 2. pkt. and in the preparatory works (2012/1 LSF 14, pkt. 3.5.3.1:
the 40 EUR is "lagt oven i" the existing reminder fees).

**The reminder template carries a legal condition.** To be able to add
debt-collection costs later, an earlier reminder must have stated
explicitly that non-payment within 10 days may lead to further collection
costs (BEK 601/2002 §§ 3-4). Without that sentence those costs are lost.
The template is a condition, not decoration.

## Interest is looked up, never hardcoded

Morarente is the Nationalbank's lending rate plus **8 percentage points**
(§ 5, stk. 1). The addition was 7 before 1 March 2013; older articles are
wrong.

The reference rate is **fixed twice a year**, on 1 January and 1 July.
This is the detail most likely to be implemented wrong, because reading
"today's rate" feels obviously correct: the Nationalbank raised its rate
on 12 June 2026, and that did **not** change the interest rate for the
first half of 2026.

| Period  | Reference rate | Morarente |
| ------- | -------------- | --------- |
| H1 2026 | 1.75 %         | 9.75 %    |
| H2 2026 | 2.00 %         | 10.00 %   |

So: fetch the rate from the Nationalbank's own feed, store it with its
validity period, and resolve by the period the claim runs in. A claim
spanning a half-year boundary is split and each part carries its own rate.
Storing the history is what makes an old statement reproducible exactly as
it was.

Interest runs from the agreed due date (§ 3, stk. 1), or otherwise 30 days
after the payment request was **dispatched** — not from the invoice date,
and no interest for the period before the debtor received it (§ 3,
stk. 2). Store the dispatch date; the communication log already does.

Related limit worth validating against: in business relationships an
agreed payment term may not exceed 30 days from dispatch unless expressly
approved and not unreasonable (§ 3 a); against a public authority 30 days
is absolute (§ 3 b, stk. 1). the customer is one.

## What is deliberately not built

**Automatic sending of reminders.** A reminder is an act in a customer
relationship, not a system event, and one that goes out because a payment
sat two days in a bank holiday costs more than it collects. Haij proposes
and prepares; a person presses send. This is the same principle as
value 4's requirement that AI-drafted outbound actions need explicit human
approval, extended to time-triggered ones.

Trade-off accepted: overdue invoices need a human to look at them. For a
one-person firm with a handful of invoices a month that is the right
trade; it should be revisited if Haij is ever run by a firm with hundreds.

## Open, to decide when this is built

- Which EU-hosted email provider.
- Whether reminders are their own documents with their own numbering, or
  letters that reference the invoice. Bogføringsloven does not require a
  reminder to be numbered; a separate sequence would still make them
  easier to talk about.
- Whether the compensation fee and interest are added as invoice lines on
  a separate claim, or shown as a statement. The former is bookkeeping,
  the latter is a letter, and they are not the same document.

## Sources

Verified 2026-08-31. Statutory text on retsinformation.dk; rates from the
Nationalbank.

- Renteloven, LBK nr 459 af 13/05/2014 — <https://www.retsinformation.dk/eli/lta/2014/459>
- BEK nr 601 af 12/07/2002 om inddrivelsesomkostninger — <https://www.retsinformation.dk/eli/lta/2002/601>
- BEK nr 105 af 31/01/2013 (the 310 kr.) — <https://www.retsinformation.dk/eli/lta/2013/105>
- BEK nr 719 af 03/06/2024 (collection-cost maxima, raised 1 July 2024) — <https://www.retsinformation.dk/eli/lta/2024/719>
- Preparatory works, 2012/1 LSF 14 — <https://www.retsinformation.dk/api/pdf/143377>
- Inkassoloven, LBK nr 1018 af 19/09/2014 — <https://www.retsinformation.dk/eli/lta/2014/1018>
- Nationalbank lending rate (XML) — <https://www.nationalbanken.dk/interestrates?lang=da&format=xml&typeCodes=UDL>
- Forbrugerombudsmanden on reminder fees — <https://forbrugerombudsmanden.dk/find-sager/sager/markedsfoeringsloven/sager-efter-markedsfoeringsloven/inkasso/rykkergebyrer-og-rentelovens-9-b>

Two things could not be confirmed from a primary source and are marked as
such rather than relied on: the text of BEK 601/2002 §§ 3-4 in its
original form (retsinformation does not serve the 2002 document as PDF;
the amendments are verified in Lovtidende), and U.2016.652Ø, read only in
summary. Both should be checked before the code depends on them.
