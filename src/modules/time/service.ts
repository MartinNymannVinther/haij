import { and, asc, between, desc, eq, sql } from "drizzle-orm";
import { companies, projects, timeEntries } from "@/core/db/schema";
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
      })
      .from(timeEntries)
      .leftJoin(companies, eq(companies.id, timeEntries.companyId))
      .leftJoin(projects, eq(projects.id, timeEntries.projectId))
      .where(between(timeEntries.entryDate, monday, sunday))
      .orderBy(asc(timeEntries.entryDate), desc(timeEntries.createdAt)),
  );
}

export async function addEntry(ctx: OrgContext, input: TimeEntryInput) {
  return withOrgContext(ctx, async (tx) => {
    let companyId = input.companyId ?? null;
    if (input.projectId) {
      // A project entry inherits the project's company unless one was
      // chosen explicitly; the RLS-scoped lookup also blocks
      // cross-tenant links (FK constraints don't know about tenants).
      const [project] = await tx
        .select({ id: projects.id, companyId: projects.companyId })
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.status, "active")))
        .limit(1);
      if (!project) throw new Error("PROJECT_NOT_FOUND");
      companyId = companyId ?? project.companyId;
    }
    if (companyId) {
      // FK constraints don't know about tenants; RLS-scoped existence
      // check prevents attaching time to another org's company.
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
        projectId: input.projectId ?? null,
        userId: ctx.userId,
        entryDate: input.entryDate,
        durationMinutes: input.durationMinutes,
        note: input.note ?? null,
      })
      .returning({ id: timeEntries.id });
    return created?.id ?? null;
  });
}

export async function deleteEntry(ctx: OrgContext, entryId: string) {
  return withOrgContext(ctx, async (tx) => {
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
