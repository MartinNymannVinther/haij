import { and, asc, between, desc, eq, sql } from "drizzle-orm";
import {
  companies,
  invoiceLines,
  invoices,
  projects,
  roles,
  tasks,
  timeEntries,
} from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { weekDates } from "./duration";

/**
 * Time-tracking services. All queries run through withOrgContext (RLS);
 * updates and deletes are additionally restricted to the caller's own
 * entries.
 */

export type TimeEntryInput = {
  companyId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  roleId?: string | null;
  entryDate: string; // yyyy-mm-dd
  durationMinutes: number;
  note?: string | null;
};

export async function listWeek(ctx: OrgContext, mondayIso: string) {
  const days = weekDates(mondayIso);
  const monday = days[0]!;
  const sunday = days[6]!;
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: timeEntries.id,
        companyId: timeEntries.companyId,
        companyName: companies.name,
        userId: timeEntries.userId,
        entryDate: timeEntries.entryDate,
        durationMinutes: timeEntries.durationMinutes,
        note: timeEntries.note,
        projectId: timeEntries.projectId,
        projectName: projects.name,
        roleName: roles.name,
        invoiceLineId: timeEntries.invoiceLineId,
        invoiceId: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        invoiceStatus: invoices.status,
      })
      .from(timeEntries)
      .leftJoin(companies, eq(companies.id, timeEntries.companyId))
      .leftJoin(projects, eq(projects.id, timeEntries.projectId))
      .leftJoin(roles, eq(roles.id, timeEntries.roleId))
      .leftJoin(invoiceLines, eq(invoiceLines.id, timeEntries.invoiceLineId))
      .leftJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
      .where(between(timeEntries.entryDate, monday, sunday))
      .orderBy(asc(timeEntries.entryDate), desc(timeEntries.createdAt)),
  );
}

export async function addEntry(ctx: OrgContext, input: TimeEntryInput) {
  return withOrgContext(ctx, async (tx) => {
    let companyId = input.companyId ?? null;
    let projectId = input.projectId ?? null;

    if (input.taskId) {
      // A task pins the project; the RLS-scoped lookup blocks
      // cross-tenant links (FK constraints don't know about tenants).
      const [task] = await tx
        .select({ id: tasks.id, projectId: tasks.projectId })
        .from(tasks)
        .where(eq(tasks.id, input.taskId))
        .limit(1);
      if (!task) throw new Error("TASK_NOT_FOUND");
      if (projectId && projectId !== task.projectId) throw new Error("TASK_NOT_FOUND");
      projectId = task.projectId;
    }
    if (projectId) {
      // A project entry inherits the project's company unless one was
      // chosen explicitly.
      const [project] = await tx
        .select({ id: projects.id, companyId: projects.companyId })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.status, "active")))
        .limit(1);
      if (!project) throw new Error("PROJECT_NOT_FOUND");
      companyId = companyId ?? project.companyId;
    }
    if (input.roleId) {
      const [role] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.id, input.roleId))
        .limit(1);
      if (!role) throw new Error("ROLE_NOT_FOUND");
    }
    if (companyId) {
      const [company] = await tx
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      if (!company) throw new Error("COMPANY_NOT_FOUND");
    }
    const [created] = await tx
      .insert(timeEntries)
      .values({
        orgId: ctx.orgId,
        companyId,
        projectId,
        taskId: input.taskId ?? null,
        roleId: input.roleId ?? null,
        userId: ctx.userId,
        entryDate: input.entryDate,
        durationMinutes: input.durationMinutes,
        note: input.note ?? null,
      })
      .returning({ id: timeEntries.id });
    return created?.id ?? null;
  });
}

/**
 * Deleting an hour that already sits on an invoice would leave the
 * invoice standing on a basis that no longer exists. The invoice itself
 * is unaffected — its lines carry their own frozen quantities and prices
 * — but the trail from the document back to the work would be gone, and
 * bogføringsloven wants that trail. An hour on a draft may still go: the
 * draft is not a document yet.
 */
export async function deleteEntry(ctx: OrgContext, entryId: string) {
  return withOrgContext(ctx, async (tx) => {
    const [entry] = await tx
      .select({ id: timeEntries.id, invoiceStatus: invoices.status })
      .from(timeEntries)
      .leftJoin(invoiceLines, eq(invoiceLines.id, timeEntries.invoiceLineId))
      .leftJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
      .where(and(eq(timeEntries.id, entryId), eq(timeEntries.userId, ctx.userId)))
      .limit(1);
    if (!entry) return false;
    if (entry.invoiceStatus && entry.invoiceStatus !== "draft") {
      throw new Error("ENTRY_INVOICED");
    }

    const result = await tx
      .delete(timeEntries)
      .where(and(eq(timeEntries.id, entryId), eq(timeEntries.userId, ctx.userId)))
      .returning({ id: timeEntries.id });
    return result.length > 0;
  });
}

/** Sum of this week's minutes across the organization (dashboard tile). */
export async function weekTotalMinutes(ctx: OrgContext, mondayIso: string) {
  const days = weekDates(mondayIso);
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx
      .select({ total: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int` })
      .from(timeEntries)
      .where(between(timeEntries.entryDate, days[0]!, days[6]!));
    return row?.total ?? 0;
  });
}
