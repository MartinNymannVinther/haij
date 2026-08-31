import { and, asc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import {
  companies,
  invoiceLines,
  invoices,
  orgProfiles,
  projects,
  roles,
  tasks,
  timeEntries,
  users,
} from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import type { ReportGrouping, ReportStatus } from "./report-options";
import {
  companyRoleRate,
  companyRoleRateOn,
  entryRateSql,
  projectRoleRate,
  projectRoleRateOn,
} from "@/modules/invoicing/rates";

/**
 * The hours behind everything else: what was done, for whom, at what
 * rate, and whether it has been invoiced.
 *
 * This is the document a customer asks for when they want to see what
 * they paid for, so filtering by invoice is a first-class case — pick an
 * invoice and get exactly the hours it covers, no more and no less.
 *
 * Values are computed with the same rate hierarchy the invoicing module
 * uses, so a report and an invoice built from the same hours never
 * disagree.
 */

export {
  REPORT_GROUPINGS,
  REPORT_STATUSES,
  type ReportGrouping,
  type ReportStatus,
} from "./report-options";

export type ReportFilters = {
  from?: string | null;
  to?: string | null;
  companyId?: string | null;
  projectId?: string | null;
  roleId?: string | null;
  invoiceId?: string | null;
  status?: ReportStatus;
};

export type ReportRow = {
  id: string;
  entryDate: string;
  companyName: string | null;
  projectName: string | null;
  taskTitle: string | null;
  roleName: string | null;
  userName: string | null;
  note: string | null;
  durationMinutes: number;
  rateOere: number;
  valueOere: number;
  invoiceNumber: number | null;
  invoiceStatus: string | null;
};

export type ReportGroup = {
  key: string;
  label: string;
  minutes: number;
  valueOere: number;
  rows: ReportRow[];
};

export type TimeReport = {
  rows: ReportRow[];
  groups: ReportGroup[];
  totalMinutes: number;
  totalValueOere: number;
  /** Minutes already sitting on an invoice, draft or issued. */
  onInvoiceMinutes: number;
};

const MONTHS_DA = [
  "januar",
  "februar",
  "marts",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "december",
];

function monthLabel(isoDate: string): string {
  return `${MONTHS_DA[Number(isoDate.slice(5, 7)) - 1] ?? ""} ${isoDate.slice(0, 4)}`.trim();
}

function groupOf(row: ReportRow, grouping: ReportGrouping): { key: string; label: string } {
  switch (grouping) {
    case "none":
      return { key: "", label: "" };
    case "company":
      return { key: row.companyName ?? "", label: row.companyName ?? "Uden kunde" };
    case "project":
      return { key: row.projectName ?? "", label: row.projectName ?? "Uden projekt" };
    case "task":
      return { key: row.taskTitle ?? "", label: row.taskTitle ?? "Uden opgave" };
    case "role":
      return { key: row.roleName ?? "", label: row.roleName ?? "Uden rolle" };
    case "month":
      return { key: row.entryDate.slice(0, 7), label: monthLabel(row.entryDate) };
  }
}

export async function getTimeReport(
  ctx: OrgContext,
  filters: ReportFilters,
  grouping: ReportGrouping = "none",
): Promise<TimeReport> {
  return withOrgContext(ctx, async (tx) => {
    const [profile] = await tx
      .select({ defaultRate: orgProfiles.defaultHourlyRateOere })
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, ctx.orgId))
      .limit(1);
    const defaultRate = profile?.defaultRate ?? 0;

    const conditions: SQL[] = [];
    if (filters.from) conditions.push(gte(timeEntries.entryDate, filters.from));
    if (filters.to) conditions.push(lte(timeEntries.entryDate, filters.to));
    if (filters.companyId) conditions.push(eq(timeEntries.companyId, filters.companyId));
    if (filters.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
    if (filters.roleId) conditions.push(eq(timeEntries.roleId, filters.roleId));
    if (filters.invoiceId) conditions.push(eq(invoiceLines.invoiceId, filters.invoiceId));
    if (filters.status === "unbilled") conditions.push(isNull(timeEntries.invoiceLineId));
    if (filters.status === "billed") conditions.push(sql`${timeEntries.invoiceLineId} is not null`);

    const rate = entryRateSql(defaultRate);

    const rows = await tx
      .select({
        id: timeEntries.id,
        entryDate: timeEntries.entryDate,
        companyName: companies.name,
        projectName: projects.name,
        taskTitle: tasks.title,
        roleName: roles.name,
        userName: users.name,
        note: timeEntries.note,
        durationMinutes: timeEntries.durationMinutes,
        rateOere: rate,
        valueOere: sql<number>`round(${timeEntries.durationMinutes} * ${rate} / 60.0)::bigint`,
        invoiceNumber: invoices.invoiceNumber,
        invoiceStatus: invoices.status,
      })
      .from(timeEntries)
      .leftJoin(companies, eq(companies.id, timeEntries.companyId))
      .leftJoin(projects, eq(projects.id, timeEntries.projectId))
      .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .leftJoin(roles, eq(roles.id, timeEntries.roleId))
      .leftJoin(users, eq(users.id, timeEntries.userId))
      .leftJoin(invoiceLines, eq(invoiceLines.id, timeEntries.invoiceLineId))
      .leftJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
      .leftJoin(projectRoleRate, projectRoleRateOn)
      .leftJoin(companyRoleRate, companyRoleRateOn)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(timeEntries.entryDate), asc(timeEntries.createdAt));

    const typed: ReportRow[] = rows.map((row) => ({
      ...row,
      rateOere: Number(row.rateOere),
      valueOere: Number(row.valueOere),
    }));

    const groups: ReportGroup[] = [];
    if (grouping !== "none") {
      const byKey = new Map<string, ReportGroup>();
      for (const row of typed) {
        const { key, label } = groupOf(row, grouping);
        const group = byKey.get(key) ?? { key, label, minutes: 0, valueOere: 0, rows: [] };
        group.minutes += row.durationMinutes;
        group.valueOere += row.valueOere;
        group.rows.push(row);
        byKey.set(key, group);
      }
      groups.push(...byKey.values());
    }

    return {
      rows: typed,
      groups,
      totalMinutes: typed.reduce((sum, row) => sum + row.durationMinutes, 0),
      totalValueOere: typed.reduce((sum, row) => sum + row.valueOere, 0),
      onInvoiceMinutes: typed.reduce(
        (sum, row) => (row.invoiceStatus === null ? sum : sum + row.durationMinutes),
        0,
      ),
    };
  });
}
