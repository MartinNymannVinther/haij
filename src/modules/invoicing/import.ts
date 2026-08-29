import { eq, inArray, sql } from "drizzle-orm";
import {
  auditLog,
  companies,
  invoiceCounters,
  invoiceLines,
  invoices,
  orgProfiles,
  timeEntries,
  type InvoiceStatus,
} from "@/core/db/schema";
import { addDaysIso } from "@/core/dates";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { invoiceTotals, lineNetOere, lineVatOere } from "./money";

/**
 * Bringing an existing business's invoice history into Haij.
 *
 * A migrated invoice is not "issued today": it already has its number,
 * its date and often its payment. The ordinary issue path allocates the
 * next number and stamps today, which is right for real invoices and
 * wrong for history, so migration gets its own door rather than options
 * bolted onto the normal one.
 *
 * The immutability rules still apply in full. The invoice is built as a
 * draft, its lines are added while it is still a draft, and one update
 * then moves it to its historic state — exactly the sequence a real
 * invoice goes through, only with the dates it actually had. After that
 * the row is frozen like any other.
 *
 * The counter is pushed past the highest imported number, so the first
 * invoice issued from Haij continues the sequence.
 */

export type HistoricLine = {
  description: string;
  /** Quantity in hundredths, e.g. 136.50 hours as 13650. */
  quantityHundredths: number;
  unit?: "hour" | "day" | "piece" | "fixed";
  unitPriceOere: number;
  vatRateBp?: number;
  /** Time entries this line covers; they are marked as billed. */
  timeEntryIds?: string[];
};

export type HistoricInvoice = {
  companyId: string;
  invoiceNumber: number;
  /** ISO date the invoice carried in the old system. */
  invoiceDate: string;
  dueDate?: string;
  paymentTermsDays?: number;
  status: Extract<InvoiceStatus, "issued" | "sent" | "paid">;
  /** ISO date the invoice was paid; required when status is paid. */
  paidDate?: string;
  note?: string;
  lines: HistoricLine[];
};

export type ImportError =
  "NUMBER_TAKEN" | "INVOICE_NO_LINES" | "PROFILE_MISSING" | "COMPANY_NOT_FOUND";

function importError(code: ImportError): Error {
  return new Error(code);
}

export async function importHistoricInvoice(
  ctx: OrgContext,
  input: HistoricInvoice,
): Promise<string> {
  if (input.lines.length === 0) throw importError("INVOICE_NO_LINES");

  return withOrgContext(ctx, async (tx) => {
    const [profile] = await tx
      .select()
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, ctx.orgId))
      .limit(1);
    if (!profile) throw importError("PROFILE_MISSING");

    const [company] = await tx
      .select()
      .from(companies)
      .where(eq(companies.id, input.companyId))
      .limit(1);
    if (!company) throw importError("COMPANY_NOT_FOUND");

    const [taken] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.invoiceNumber, input.invoiceNumber))
      .limit(1);
    if (taken) throw importError("NUMBER_TAKEN");

    const paymentTermsDays = input.paymentTermsDays ?? profile.defaultPaymentTermsDays;

    const [draft] = await tx
      .insert(invoices)
      .values({
        orgId: ctx.orgId,
        companyId: input.companyId,
        paymentTermsDays,
        note: input.note ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: invoices.id });
    if (!draft) throw new Error("invoice insert returned no row");

    const totalsInput: Array<{ lineNetOere: number; lineVatOere: number }> = [];
    for (const [position, line] of input.lines.entries()) {
      const vatRateBp = line.vatRateBp ?? 2500;
      const net = lineNetOere(line.quantityHundredths, line.unitPriceOere);
      const vat = lineVatOere(net, vatRateBp);
      totalsInput.push({ lineNetOere: net, lineVatOere: vat });

      const [created] = await tx
        .insert(invoiceLines)
        .values({
          orgId: ctx.orgId,
          invoiceId: draft.id,
          position,
          description: line.description,
          quantityHundredths: line.quantityHundredths,
          unit: line.unit ?? "hour",
          unitPriceOere: line.unitPriceOere,
          vatCategory: vatRateBp === 0 ? "zero" : "standard",
          vatRateBp,
          lineNetOere: net,
          lineVatOere: vat,
        })
        .returning({ id: invoiceLines.id });

      if (created && line.timeEntryIds?.length) {
        await tx
          .update(timeEntries)
          .set({ invoiceLineId: created.id, updatedAt: new Date() })
          .where(inArray(timeEntries.id, line.timeEntryIds));
      }
    }

    const totals = invoiceTotals(totalsInput);
    const paidAt = input.paidDate ? new Date(`${input.paidDate}T12:00:00Z`) : null;
    const issuedAt = new Date(`${input.invoiceDate}T12:00:00Z`);

    await tx
      .update(invoices)
      .set({
        status: input.status,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        deliveryDate: input.invoiceDate,
        dueDate: input.dueDate ?? addDaysIso(input.invoiceDate, paymentTermsDays),
        buyerName: company.name,
        buyerCvr: company.cvr,
        buyerAddress: company.address,
        buyerZipcode: company.zipcode,
        buyerCity: company.city,
        sellerName: profile.legalName,
        sellerCvr: profile.cvr,
        sellerAddress: profile.address,
        sellerZipcode: profile.zipcode,
        sellerCity: profile.city,
        sellerEmail: profile.email,
        sellerPhone: profile.phone,
        sellerBankReg: profile.bankReg,
        sellerBankKonto: profile.bankKonto,
        netOere: totals.netOere,
        vatOere: totals.vatOere,
        grossOere: totals.grossOere,
        issuedAt,
        sentAt: input.status === "issued" ? null : issuedAt,
        paidAt: input.status === "paid" ? (paidAt ?? issuedAt) : null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, draft.id));

    // The counter must never hand out a number the history already used.
    await tx.execute(sql`
      insert into invoice_counters (org_id, next_number)
      values (${ctx.orgId}, ${input.invoiceNumber + 1})
      on conflict (org_id) do update
        set next_number = greatest(${invoiceCounters.nextNumber}, ${input.invoiceNumber + 1})
    `);

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      actorType: "user",
      action: "invoices.imported",
      entityType: "invoice",
      entityId: draft.id,
      after: {
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        status: input.status,
        grossOere: totals.grossOere,
      },
    });

    return draft.id;
  });
}
