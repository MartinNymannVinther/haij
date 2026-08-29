import { asc, desc, eq, sql } from "drizzle-orm";
import {
  budgets,
  companies,
  invoices,
  orgProfiles,
  projects,
  tasks,
  timeEntries,
} from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import {
  companyRoleRate,
  companyRoleRateOn,
  entryValueSql,
  projectRoleRate,
  projectRoleRateOn,
} from "./rates";

/**
 * The economy views Martin asked for: monthly revenue targets against
 * realized revenue, and per-customer economy with agreed frames (hours
 * and/or amount) and their consumption.
 *
 * Realized revenue = net amounts of issued invoices by invoice date —
 * credit notes carry negative amounts, so they subtract by themselves.
 */

export async function setRevenueTarget(
  ctx: OrgContext,
  year: number,
  month: number,
  revenueTargetOere: number,
) {
  return withOrgContext(ctx, async (tx) => {
    await tx
      .insert(budgets)
      .values({ orgId: ctx.orgId, year, month, revenueTargetOere })
      .onConflictDoUpdate({
        target: [budgets.orgId, budgets.year, budgets.month],
        set: { revenueTargetOere, updatedAt: new Date() },
      });
  });
}

export type MonthRow = {
  year: number;
  month: number;
  targetOere: number | null;
  realizedOere: number;
  outstandingOere: number;
};

/** All twelve months of a year: target, realized and still-unpaid. */
export async function getYearOverview(ctx: OrgContext, year: number): Promise<MonthRow[]> {
  return withOrgContext(ctx, async (tx) => {
    const targets = await tx
      .select({ month: budgets.month, targetOere: budgets.revenueTargetOere })
      .from(budgets)
      .where(eq(budgets.year, year))
      .orderBy(asc(budgets.month));

    const realized = await tx
      .select({
        month: sql<number>`extract(month from invoice_date)::int`,
        realizedOere: sql<number>`coalesce(sum(net_oere), 0)::bigint`,
        outstandingOere: sql<number>`coalesce(sum(gross_oere) filter (where status in ('issued', 'sent')), 0)::bigint`,
      })
      .from(invoices)
      .where(sql`status <> 'draft' and extract(year from invoice_date) = ${year}`)
      .groupBy(sql`extract(month from invoice_date)`);

    const targetByMonth = new Map(targets.map((t) => [t.month, Number(t.targetOere)]));
    const realizedByMonth = new Map(
      realized.map((r) => [
        Number(r.month),
        { realized: Number(r.realizedOere), outstanding: Number(r.outstandingOere) },
      ]),
    );

    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const actual = realizedByMonth.get(month);
      return {
        year,
        month,
        targetOere: targetByMonth.get(month) ?? null,
        realizedOere: actual?.realized ?? 0,
        outstandingOere: actual?.outstanding ?? 0,
      };
    });
  });
}

export type CustomerEconomyRow = {
  companyId: string;
  companyName: string;
  hourlyRateOere: number | null;
  budgetMinutes: number | null;
  budgetAmountOere: number | null;
  trackedMinutes: number;
  unbilledMinutes: number;
  invoicedNetOere: number;
  paidGrossOere: number;
  outstandingGrossOere: number;
};

/**
 * Per-customer economy: tracked and unbilled time, invoiced and paid
 * amounts — the numbers the agreed frames are checked against.
 */
export async function getCustomerEconomy(ctx: OrgContext): Promise<CustomerEconomyRow[]> {
  return withOrgContext(ctx, async (tx) => {
    const time = tx
      .select({
        companyId: timeEntries.companyId,
        trackedMinutes: sql<number>`coalesce(sum(duration_minutes), 0)::int`.as("tracked_minutes"),
        unbilledMinutes:
          sql<number>`coalesce(sum(duration_minutes) filter (where invoice_line_id is null), 0)::int`.as(
            "unbilled_minutes",
          ),
      })
      .from(timeEntries)
      .groupBy(timeEntries.companyId)
      .as("time");

    const billing = tx
      .select({
        companyId: invoices.companyId,
        invoicedNetOere:
          sql<number>`coalesce(sum(net_oere) filter (where status <> 'draft'), 0)::bigint`.as(
            "invoiced_net_oere",
          ),
        paidGrossOere:
          sql<number>`coalesce(sum(gross_oere) filter (where status = 'paid'), 0)::bigint`.as(
            "paid_gross_oere",
          ),
        outstandingGrossOere:
          sql<number>`coalesce(sum(gross_oere) filter (where status in ('issued', 'sent')), 0)::bigint`.as(
            "outstanding_gross_oere",
          ),
      })
      .from(invoices)
      .groupBy(invoices.companyId)
      .as("billing");

    const rows = await tx
      .select({
        companyId: companies.id,
        companyName: companies.name,
        hourlyRateOere: companies.hourlyRateOere,
        budgetMinutes: companies.budgetMinutes,
        budgetAmountOere: companies.budgetAmountOere,
        trackedMinutes: sql<number>`coalesce(${time.trackedMinutes}, 0)::int`,
        unbilledMinutes: sql<number>`coalesce(${time.unbilledMinutes}, 0)::int`,
        invoicedNetOere: sql<number>`coalesce(${billing.invoicedNetOere}, 0)::bigint`,
        paidGrossOere: sql<number>`coalesce(${billing.paidGrossOere}, 0)::bigint`,
        outstandingGrossOere: sql<number>`coalesce(${billing.outstandingGrossOere}, 0)::bigint`,
      })
      .from(companies)
      .leftJoin(time, eq(time.companyId, companies.id))
      .leftJoin(billing, eq(billing.companyId, companies.id))
      .orderBy(asc(companies.name));

    return rows.map((row) => ({
      ...row,
      trackedMinutes: Number(row.trackedMinutes),
      unbilledMinutes: Number(row.unbilledMinutes),
      invoicedNetOere: Number(row.invoicedNetOere),
      paidGrossOere: Number(row.paidGrossOere),
      outstandingGrossOere: Number(row.outstandingGrossOere),
    }));
  });
}

/** Frame settings on a single customer (rate, hour frame, amount frame). */
export async function setCustomerFrame(
  ctx: OrgContext,
  companyId: string,
  input: {
    hourlyRateOere: number | null;
    budgetMinutes: number | null;
    budgetAmountOere: number | null;
  },
) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .update(companies)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(companies.id, companyId))
      .returning({ id: companies.id });
    return result.length > 0;
  });
}

/**
 * Unbilled time per customer, valued with the full rate hierarchy resolved
 * per entry in SQL: role rate on the project -> role rate on the customer
 * -> task -> project -> customer -> org default.
 * The customer list and the customer page both show this number, so it is
 * computed once here rather than twice in the views.
 */
export async function getUnbilledByCompany(
  ctx: OrgContext,
): Promise<Map<string, { minutes: number; valueOere: number }>> {
  return withOrgContext(ctx, async (tx) => {
    const [profile] = await tx
      .select({ defaultRate: orgProfiles.defaultHourlyRateOere })
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, ctx.orgId))
      .limit(1);
    const defaultRate = profile?.defaultRate ?? 0;

    const rows = await tx
      .select({
        companyId: timeEntries.companyId,
        minutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
        valueOere: entryValueSql(defaultRate),
      })
      .from(timeEntries)
      .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .leftJoin(projects, eq(projects.id, timeEntries.projectId))
      .leftJoin(companies, eq(companies.id, timeEntries.companyId))
      .leftJoin(projectRoleRate, projectRoleRateOn)
      .leftJoin(companyRoleRate, companyRoleRateOn)
      .where(sql`${timeEntries.invoiceLineId} is null`)
      .groupBy(timeEntries.companyId);

    const map = new Map<string, { minutes: number; valueOere: number }>();
    for (const row of rows) {
      if (!row.companyId) continue;
      map.set(row.companyId, { minutes: Number(row.minutes), valueOere: Number(row.valueOere) });
    }
    return map;
  });
}

export type UnbilledCustomer = {
  companyId: string;
  companyName: string;
  minutes: number;
  valueOere: number;
};

/**
 * Customers with hours nobody has invoiced yet, biggest first. This is
 * the shortlist the "new invoice" dialog opens on: an invoice almost
 * always starts from tracked time, so the customers with unbilled hours
 * are the answer to "who am I invoicing" nine times out of ten.
 */
export async function listUnbilledCustomers(ctx: OrgContext): Promise<UnbilledCustomer[]> {
  return withOrgContext(ctx, async (tx) => {
    const [profile] = await tx
      .select({ defaultRate: orgProfiles.defaultHourlyRateOere })
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, ctx.orgId))
      .limit(1);
    const defaultRate = profile?.defaultRate ?? 0;

    const rows = await tx
      .select({
        companyId: timeEntries.companyId,
        companyName: companies.name,
        minutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
        valueOere: entryValueSql(defaultRate),
      })
      .from(timeEntries)
      .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .leftJoin(projects, eq(projects.id, timeEntries.projectId))
      .innerJoin(companies, eq(companies.id, timeEntries.companyId))
      .leftJoin(projectRoleRate, projectRoleRateOn)
      .leftJoin(companyRoleRate, companyRoleRateOn)
      .where(sql`${timeEntries.invoiceLineId} is null`)
      .groupBy(timeEntries.companyId, companies.name)
      .orderBy(desc(sql`sum(${timeEntries.durationMinutes})`));

    return rows
      .filter((row): row is typeof row & { companyId: string } => Boolean(row.companyId))
      .map((row) => ({
        companyId: row.companyId,
        companyName: row.companyName,
        minutes: Number(row.minutes),
        valueOere: Number(row.valueOere),
      }));
  });
}
