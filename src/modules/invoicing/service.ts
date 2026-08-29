import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { todayInCopenhagen, addDaysIso, formatDateDa } from "@/core/dates";
import {
  activities,
  companies,
  invoiceLines,
  invoices,
  orgProfiles,
  projects,
  roles,
  tasks,
  timeEntries,
  type InvoiceStatus,
  type InvoiceUnit,
  type VatCategory,
} from "@/core/db/schema";
import { withOrgContext, type AppTransaction, type OrgContext } from "@/core/db/tenant";
import { invoiceTotals, lineNetOere, lineVatOere, minutesToQuantityHundredths } from "./money";
import { allocateInvoiceNumber } from "./numbering";
import {
  companyRoleRate,
  companyRoleRateOn,
  projectRoleRate,
  projectRoleRateOn,
  resolveHourlyRateOere,
} from "./rates";

/**
 * Invoicing services. RLS scopes every query to the caller's organization;
 * the database triggers additionally freeze issued invoices, so the status
 * checks here are for friendly errors, not for safety.
 *
 * Domain errors are thrown as Error(CODE) and translated by the actions.
 */

export type InvoiceError =
  | "INVOICE_NOT_FOUND"
  | "INVOICE_NOT_DRAFT"
  | "INVOICE_NOT_ISSUED"
  | "INVOICE_NO_LINES"
  | "INVOICE_NO_COMPANY"
  | "PROFILE_MISSING"
  | "COMPANY_NOT_FOUND"
  | "NO_UNBILLED_TIME";

function domainError(code: InvoiceError): Error {
  return new Error(code);
}

async function getInvoiceOrThrow(tx: AppTransaction, invoiceId: string) {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) throw domainError("INVOICE_NOT_FOUND");
  return invoice;
}

async function getDraftOrThrow(tx: AppTransaction, invoiceId: string) {
  const invoice = await getInvoiceOrThrow(tx, invoiceId);
  if (invoice.status !== "draft") throw domainError("INVOICE_NOT_DRAFT");
  return invoice;
}

async function getCompanyOrThrow(tx: AppTransaction, companyId: string) {
  const [company] = await tx.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!company) throw domainError("COMPANY_NOT_FOUND");
  return company;
}

/** Keeps the stored draft totals in sync with the lines. */
async function recomputeTotals(tx: AppTransaction, invoiceId: string): Promise<void> {
  const lines = await tx
    .select({ lineNetOere: invoiceLines.lineNetOere, lineVatOere: invoiceLines.lineVatOere })
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId));
  const totals = invoiceTotals(lines);
  await tx
    .update(invoices)
    .set({
      netOere: totals.netOere,
      vatOere: totals.vatOere,
      grossOere: totals.grossOere,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));
}

/* ----------------------------- Queries ------------------------------ */

export async function listInvoices(ctx: OrgContext, status?: InvoiceStatus) {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: invoices.id,
        type: invoices.type,
        status: invoices.status,
        invoiceNumber: invoices.invoiceNumber,
        invoiceDate: invoices.invoiceDate,
        dueDate: invoices.dueDate,
        grossOere: invoices.grossOere,
        buyerName: invoices.buyerName,
        companyId: invoices.companyId,
        companyName: companies.name,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .leftJoin(companies, eq(companies.id, invoices.companyId))
      .where(status ? eq(invoices.status, status) : undefined)
      .orderBy(desc(invoices.createdAt)),
  );
}

export async function getInvoiceDetail(ctx: OrgContext, invoiceId: string) {
  return withOrgContext(ctx, async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!invoice) return null;

    const lines = await tx
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId))
      .orderBy(asc(invoiceLines.position), asc(invoiceLines.createdAt));

    const company = invoice.companyId
      ? ((
          await tx.select().from(companies).where(eq(companies.id, invoice.companyId)).limit(1)
        )[0] ?? null)
      : null;

    const [profile] = await tx
      .select()
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, ctx.orgId))
      .limit(1);

    return { invoice, lines, company, profile: profile ?? null };
  });
}

/** Outstanding = issued or sent, not yet paid. For the dashboard. */
export async function getInvoicingOverview(ctx: OrgContext) {
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx
      .select({
        outstandingOere: sql<number>`coalesce(sum(gross_oere) filter (where status in ('issued', 'sent')), 0)::bigint`,
        overdueOere: sql<number>`coalesce(sum(gross_oere) filter (where status in ('issued', 'sent') and due_date < current_date), 0)::bigint`,
        draftCount: sql<number>`count(*) filter (where status = 'draft')::int`,
      })
      .from(invoices);
    return {
      outstandingOere: Number(row?.outstandingOere ?? 0),
      overdueOere: Number(row?.overdueOere ?? 0),
      draftCount: Number(row?.draftCount ?? 0),
    };
  });
}

/**
 * Issued or sent invoices past their due date, newest first. The dashboard
 * turns these into the first rows of "needs attention".
 */
export async function listOverdueInvoices(ctx: OrgContext, limit = 5) {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        buyerName: invoices.buyerName,
        companyName: companies.name,
        dueDate: invoices.dueDate,
        grossOere: invoices.grossOere,
      })
      .from(invoices)
      .leftJoin(companies, eq(companies.id, invoices.companyId))
      .where(
        sql`${invoices.status} in ('issued', 'sent') and ${invoices.type} = 'invoice' and ${invoices.dueDate} < current_date`,
      )
      .orderBy(asc(invoices.dueDate))
      .limit(limit),
  );
}

/* ------------------------------ Drafts ------------------------------ */

export async function createDraft(ctx: OrgContext, companyId?: string | null) {
  return withOrgContext(ctx, async (tx) => {
    if (companyId) await getCompanyOrThrow(tx, companyId);
    const [profile] = await tx
      .select({ terms: orgProfiles.defaultPaymentTermsDays })
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, ctx.orgId))
      .limit(1);

    const [created] = await tx
      .insert(invoices)
      .values({
        orgId: ctx.orgId,
        companyId: companyId ?? null,
        paymentTermsDays: profile?.terms ?? 14,
        createdBy: ctx.userId,
      })
      .returning({ id: invoices.id });
    if (!created) throw new Error("invoice insert returned no row");
    return created.id;
  });
}

export type DraftFromTimeOptions = {
  /** Inclusive yyyy-mm-dd bounds; omitted side means unbounded. */
  from?: string | null;
  to?: string | null;
};

function unbilledFilter(companyId: string, options?: DraftFromTimeOptions) {
  return and(
    eq(timeEntries.companyId, companyId),
    isNull(timeEntries.invoiceLineId),
    options?.from ? gte(timeEntries.entryDate, options.from) : undefined,
    options?.to ? lte(timeEntries.entryDate, options.to) : undefined,
  );
}

/** Unbilled minutes and entry count for a company, optionally date-bounded. */
export async function unbilledSummary(
  ctx: OrgContext,
  companyId: string,
  options?: DraftFromTimeOptions,
) {
  return withOrgContext(ctx, async (tx) => {
    await getCompanyOrThrow(tx, companyId);
    const [row] = await tx
      .select({
        minutes: sql<number>`coalesce(sum(duration_minutes), 0)::int`,
        entries: sql<number>`count(*)::int`,
      })
      .from(timeEntries)
      .where(unbilledFilter(companyId, options));
    return { minutes: Number(row?.minutes ?? 0), entries: Number(row?.entries ?? 0) };
  });
}

/**
 * Builds a draft from the company's unbilled time — all of it, or the
 * inclusive date range in `options`. One line per entry, each priced
 * individually: role -> task -> project -> customer -> org default (all
 * rates excl. VAT). Entries are linked to their line so they never get
 * billed twice, and unlink again if the line or draft is deleted.
 */
export async function createDraftFromTime(
  ctx: OrgContext,
  companyId: string,
  options?: DraftFromTimeOptions,
) {
  return withOrgContext(ctx, async (tx) => {
    const company = await getCompanyOrThrow(tx, companyId);
    const [profile] = await tx
      .select()
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, ctx.orgId))
      .limit(1);

    const entries = await tx
      .select({
        id: timeEntries.id,
        entryDate: timeEntries.entryDate,
        durationMinutes: timeEntries.durationMinutes,
        note: timeEntries.note,
        roleName: roles.name,
        projectRoleRateOere: projectRoleRate.hourlyRateOere,
        companyRoleRateOere: companyRoleRate.hourlyRateOere,
        taskRateOere: tasks.hourlyRateOere,
        projectRateOere: projects.hourlyRateOere,
      })
      .from(timeEntries)
      .leftJoin(roles, eq(roles.id, timeEntries.roleId))
      .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .leftJoin(projects, eq(projects.id, timeEntries.projectId))
      .leftJoin(projectRoleRate, projectRoleRateOn)
      .leftJoin(companyRoleRate, companyRoleRateOn)
      .where(unbilledFilter(companyId, options))
      .orderBy(asc(timeEntries.entryDate), asc(timeEntries.createdAt));
    if (entries.length === 0) throw domainError("NO_UNBILLED_TIME");

    const [created] = await tx
      .insert(invoices)
      .values({
        orgId: ctx.orgId,
        companyId,
        paymentTermsDays: profile?.defaultPaymentTermsDays ?? 14,
        createdBy: ctx.userId,
      })
      .returning({ id: invoices.id });
    if (!created) throw new Error("invoice insert returned no row");

    for (const [index, entry] of entries.entries()) {
      const unitPriceOere = resolveHourlyRateOere({
        projectRoleRateOere: entry.projectRoleRateOere,
        companyRoleRateOere: entry.companyRoleRateOere,
        taskRateOere: entry.taskRateOere,
        projectRateOere: entry.projectRateOere,
        companyRateOere: company.hourlyRateOere,
        orgDefaultRateOere: profile?.defaultHourlyRateOere,
      });
      const quantityHundredths = minutesToQuantityHundredths(entry.durationMinutes);
      const net = lineNetOere(quantityHundredths, unitPriceOere);
      const label = entry.note ?? "Konsulentarbejde";
      const [line] = await tx
        .insert(invoiceLines)
        .values({
          orgId: ctx.orgId,
          invoiceId: created.id,
          position: index,
          description: `${formatDateDa(entry.entryDate)} · ${label}${
            entry.roleName ? ` (${entry.roleName})` : ""
          }`,
          quantityHundredths,
          unit: "hour",
          unitPriceOere,
          vatCategory: "standard",
          vatRateBp: 2500,
          lineNetOere: net,
          lineVatOere: lineVatOere(net, 2500),
        })
        .returning({ id: invoiceLines.id });
      if (!line) throw new Error("invoice line insert returned no row");
      await tx
        .update(timeEntries)
        .set({ invoiceLineId: line.id, updatedAt: new Date() })
        .where(eq(timeEntries.id, entry.id));
    }

    await recomputeTotals(tx, created.id);
    return created.id;
  });
}

export type DraftUpdate = {
  companyId?: string | null;
  note?: string | null;
  paymentTermsDays?: number;
  deliveryDate?: string | null;
  buyerReference?: string | null;
  buyerEanGln?: string | null;
};

export async function updateDraft(ctx: OrgContext, invoiceId: string, input: DraftUpdate) {
  return withOrgContext(ctx, async (tx) => {
    await getDraftOrThrow(tx, invoiceId);
    if (input.companyId) await getCompanyOrThrow(tx, input.companyId);
    await tx
      .update(invoices)
      .set({
        ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.paymentTermsDays !== undefined
          ? { paymentTermsDays: input.paymentTermsDays }
          : {}),
        ...(input.deliveryDate !== undefined ? { deliveryDate: input.deliveryDate } : {}),
        ...(input.buyerReference !== undefined ? { buyerReference: input.buyerReference } : {}),
        ...(input.buyerEanGln !== undefined ? { buyerEanGln: input.buyerEanGln } : {}),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));
  });
}

export async function deleteDraft(ctx: OrgContext, invoiceId: string) {
  return withOrgContext(ctx, async (tx) => {
    await getDraftOrThrow(tx, invoiceId);
    // Lines cascade; linked time entries unlink via ON DELETE SET NULL.
    await tx.delete(invoices).where(eq(invoices.id, invoiceId));
  });
}

/* ------------------------------ Lines ------------------------------- */

export type LineInput = {
  description: string;
  quantityHundredths: number;
  unit: InvoiceUnit;
  unitPriceOere: number;
  vatCategory: VatCategory;
  vatRateBp: number;
};

function lineValues(input: LineInput) {
  const net = lineNetOere(input.quantityHundredths, input.unitPriceOere);
  return {
    description: input.description,
    quantityHundredths: input.quantityHundredths,
    unit: input.unit,
    unitPriceOere: input.unitPriceOere,
    vatCategory: input.vatCategory,
    vatRateBp: input.vatRateBp,
    lineNetOere: net,
    lineVatOere: lineVatOere(net, input.vatRateBp),
  };
}

export async function addLine(ctx: OrgContext, invoiceId: string, input: LineInput) {
  return withOrgContext(ctx, async (tx) => {
    await getDraftOrThrow(tx, invoiceId);
    const [max] = await tx
      .select({ position: sql<number>`coalesce(max(position), -1)::int` })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId));
    await tx.insert(invoiceLines).values({
      orgId: ctx.orgId,
      invoiceId,
      position: (max?.position ?? -1) + 1,
      ...lineValues(input),
    });
    await recomputeTotals(tx, invoiceId);
  });
}

export async function updateLine(ctx: OrgContext, lineId: string, input: LineInput) {
  return withOrgContext(ctx, async (tx) => {
    const [line] = await tx
      .select({ id: invoiceLines.id, invoiceId: invoiceLines.invoiceId })
      .from(invoiceLines)
      .where(eq(invoiceLines.id, lineId))
      .limit(1);
    if (!line) throw domainError("INVOICE_NOT_FOUND");
    await getDraftOrThrow(tx, line.invoiceId);
    await tx
      .update(invoiceLines)
      .set({ ...lineValues(input), updatedAt: new Date() })
      .where(eq(invoiceLines.id, lineId));
    await recomputeTotals(tx, line.invoiceId);
  });
}

export async function removeLine(ctx: OrgContext, lineId: string) {
  return withOrgContext(ctx, async (tx) => {
    const [line] = await tx
      .select({ id: invoiceLines.id, invoiceId: invoiceLines.invoiceId })
      .from(invoiceLines)
      .where(eq(invoiceLines.id, lineId))
      .limit(1);
    if (!line) throw domainError("INVOICE_NOT_FOUND");
    await getDraftOrThrow(tx, line.invoiceId);
    await tx.delete(invoiceLines).where(eq(invoiceLines.id, lineId));
    await recomputeTotals(tx, line.invoiceId);
  });
}

/* --------------------------- Issue & flow --------------------------- */

/**
 * Issues a draft in one transaction: allocates the next gapless number,
 * freezes buyer and seller snapshots and computes the final totals. From
 * here on the database refuses every change except the status flow.
 */
export async function issueInvoice(ctx: OrgContext, invoiceId: string) {
  return withOrgContext(ctx, async (tx) => {
    const invoice = await getDraftOrThrow(tx, invoiceId);

    const lines = await tx
      .select({ lineNetOere: invoiceLines.lineNetOere, lineVatOere: invoiceLines.lineVatOere })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId));
    if (lines.length === 0) throw domainError("INVOICE_NO_LINES");

    const [profile] = await tx
      .select()
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, ctx.orgId))
      .limit(1);
    if (!profile) throw domainError("PROFILE_MISSING");

    // Buyer snapshot: from the company — except a credit note born with a
    // copied snapshot, which keeps the document it credits.
    let buyer: {
      buyerName: string | null;
      buyerCvr: string | null;
      buyerAddress: string | null;
      buyerZipcode: string | null;
      buyerCity: string | null;
      buyerEanGln: string | null;
    } = {
      buyerName: invoice.buyerName,
      buyerCvr: invoice.buyerCvr,
      buyerAddress: invoice.buyerAddress,
      buyerZipcode: invoice.buyerZipcode,
      buyerCity: invoice.buyerCity,
      buyerEanGln: invoice.buyerEanGln,
    };
    if (!(invoice.type === "credit_note" && invoice.buyerName)) {
      if (!invoice.companyId) throw domainError("INVOICE_NO_COMPANY");
      const company = await getCompanyOrThrow(tx, invoice.companyId);
      buyer = {
        buyerName: company.name,
        buyerCvr: company.cvr,
        buyerAddress: company.address,
        buyerZipcode: company.zipcode,
        buyerCity: company.city,
        // The customer's EAN comes along with the rest of the snapshot,
        // but never overwrites one typed on this particular invoice.
        buyerEanGln: invoice.buyerEanGln ?? company.eanGln,
      };
    }

    const invoiceNumber = await allocateInvoiceNumber(tx, ctx.orgId);
    const invoiceDate = todayInCopenhagen();
    const totals = invoiceTotals(lines);

    await tx
      .update(invoices)
      .set({
        status: "issued",
        invoiceNumber,
        invoiceDate,
        deliveryDate: invoice.deliveryDate ?? invoiceDate,
        dueDate: addDaysIso(invoiceDate, invoice.paymentTermsDays),
        ...buyer,
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
        issuedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    if (invoice.companyId) {
      await tx.insert(activities).values({
        orgId: ctx.orgId,
        companyId: invoice.companyId,
        type: "system",
        metadata: {
          event: invoice.type === "credit_note" ? "credit_note_issued" : "invoice_issued",
          invoiceId,
          invoiceNumber,
          grossOere: totals.grossOere,
        },
        createdBy: ctx.userId,
      });
    }

    return invoiceNumber;
  });
}

/**
 * A credit note is the only way to undo an issued invoice: a new draft
 * with negated quantities, carrying the original's buyer snapshot.
 */
export async function createCreditNote(ctx: OrgContext, invoiceId: string) {
  return withOrgContext(ctx, async (tx) => {
    const original = await getInvoiceOrThrow(tx, invoiceId);
    if (original.status === "draft") throw domainError("INVOICE_NOT_ISSUED");
    if (original.type !== "invoice") throw domainError("INVOICE_NOT_ISSUED");

    const originalLines = await tx
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId))
      .orderBy(asc(invoiceLines.position));

    const [created] = await tx
      .insert(invoices)
      .values({
        orgId: ctx.orgId,
        type: "credit_note",
        creditedInvoiceId: invoiceId,
        companyId: original.companyId,
        paymentTermsDays: original.paymentTermsDays,
        note: `Kreditnota for faktura ${original.invoiceNumber}`,
        buyerName: original.buyerName,
        buyerCvr: original.buyerCvr,
        buyerAddress: original.buyerAddress,
        buyerZipcode: original.buyerZipcode,
        buyerCity: original.buyerCity,
        buyerEanGln: original.buyerEanGln,
        buyerReference: original.buyerReference,
        createdBy: ctx.userId,
      })
      .returning({ id: invoices.id });
    if (!created) throw new Error("credit note insert returned no row");

    for (const line of originalLines) {
      const quantityHundredths = -line.quantityHundredths;
      const net = lineNetOere(quantityHundredths, line.unitPriceOere);
      await tx.insert(invoiceLines).values({
        orgId: ctx.orgId,
        invoiceId: created.id,
        position: line.position,
        description: line.description,
        quantityHundredths,
        unit: line.unit,
        unitPriceOere: line.unitPriceOere,
        vatCategory: line.vatCategory,
        vatRateBp: line.vatRateBp,
        lineNetOere: net,
        lineVatOere: lineVatOere(net, line.vatRateBp),
      });
    }

    await recomputeTotals(tx, created.id);
    return created.id;
  });
}

export async function markSent(ctx: OrgContext, invoiceId: string) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .update(invoices)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.status, "issued")))
      .returning({ id: invoices.id });
    if (result.length === 0) throw domainError("INVOICE_NOT_ISSUED");
  });
}

export async function markPaid(ctx: OrgContext, invoiceId: string) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .update(invoices)
      .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), inArray(invoices.status, ["issued", "sent"])))
      .returning({ id: invoices.id });
    if (result.length === 0) throw domainError("INVOICE_NOT_ISSUED");
  });
}
