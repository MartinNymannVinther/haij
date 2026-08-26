import { asc, desc, eq, sql } from "drizzle-orm";
import {
  companies,
  orgProfiles,
  projects,
  tasks,
  timeEntries,
  type ProjectStatus,
} from "@/core/db/schema";
import { withOrgContext, type AppTransaction, type OrgContext } from "@/core/db/tenant";

/**
 * Light project management: projects with agreed frames, a task list and
 * linked time. RLS scopes everything to the caller's organization.
 */

export type ProjectInput = {
  name: string;
  companyId?: string | null;
  description?: string | null;
  deadline?: string | null;
  budgetMinutes?: number | null;
  budgetAmountOere?: number | null;
};

async function assertCompanyInOrg(tx: AppTransaction, companyId: string): Promise<void> {
  const [row] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!row) throw new Error("COMPANY_NOT_FOUND");
}

async function getProjectOrThrow(tx: AppTransaction, projectId: string) {
  const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return project;
}

export type ProjectListRow = {
  id: string;
  name: string;
  status: ProjectStatus;
  companyId: string | null;
  companyName: string | null;
  deadline: string | null;
  budgetMinutes: number | null;
  budgetAmountOere: number | null;
  trackedMinutes: number;
  trackedValueOere: number;
  openTasks: number;
  doneTasks: number;
};

/**
 * Projects with consumption: tracked minutes and their value, priced at
 * the customer rate with the org default as fallback. The value is what
 * the amount frame is monitored against until invoices carry project ids.
 */
export async function listProjects(ctx: OrgContext, status?: ProjectStatus) {
  return withOrgContext(ctx, async (tx): Promise<ProjectListRow[]> => {
    const time = tx
      .select({
        projectId: timeEntries.projectId,
        trackedMinutes: sql<number>`coalesce(sum(duration_minutes), 0)::int`.as("tracked_minutes"),
      })
      .from(timeEntries)
      .groupBy(timeEntries.projectId)
      .as("time");

    const taskCounts = tx
      .select({
        projectId: tasks.projectId,
        openTasks: sql<number>`count(*) filter (where not is_done)::int`.as("open_tasks"),
        doneTasks: sql<number>`count(*) filter (where is_done)::int`.as("done_tasks"),
      })
      .from(tasks)
      .groupBy(tasks.projectId)
      .as("task_counts");

    const rows = await tx
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        companyId: projects.companyId,
        companyName: companies.name,
        deadline: projects.deadline,
        budgetMinutes: projects.budgetMinutes,
        budgetAmountOere: projects.budgetAmountOere,
        trackedMinutes: sql<number>`coalesce(${time.trackedMinutes}, 0)::int`,
        openTasks: sql<number>`coalesce(${taskCounts.openTasks}, 0)::int`,
        doneTasks: sql<number>`coalesce(${taskCounts.doneTasks}, 0)::int`,
        companyRateOere: companies.hourlyRateOere,
      })
      .from(projects)
      .leftJoin(companies, eq(companies.id, projects.companyId))
      .leftJoin(time, eq(time.projectId, projects.id))
      .leftJoin(taskCounts, eq(taskCounts.projectId, projects.id))
      .where(status ? eq(projects.status, status) : undefined)
      .orderBy(asc(projects.status), desc(projects.updatedAt));

    const [profile] = await tx
      .select({ defaultRate: orgProfiles.defaultHourlyRateOere })
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, ctx.orgId))
      .limit(1);
    const defaultRate = profile?.defaultRate ?? 0;

    return rows.map((row) => {
      const rate = row.companyRateOere ?? defaultRate;
      const trackedMinutes = Number(row.trackedMinutes);
      return {
        id: row.id,
        name: row.name,
        status: row.status as ProjectStatus,
        companyId: row.companyId,
        companyName: row.companyName,
        deadline: row.deadline,
        budgetMinutes: row.budgetMinutes,
        budgetAmountOere: row.budgetAmountOere,
        trackedMinutes,
        trackedValueOere: Math.round((trackedMinutes * rate) / 60),
        openTasks: Number(row.openTasks),
        doneTasks: Number(row.doneTasks),
      };
    });
  });
}

export async function getProjectDetail(ctx: OrgContext, projectId: string) {
  return withOrgContext(ctx, async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return null;

    const company = project.companyId
      ? ((
          await tx.select().from(companies).where(eq(companies.id, project.companyId)).limit(1)
        )[0] ?? null)
      : null;

    const projectTasks = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.isDone), asc(tasks.position), asc(tasks.createdAt));

    const recentTime = await tx
      .select({
        id: timeEntries.id,
        entryDate: timeEntries.entryDate,
        durationMinutes: timeEntries.durationMinutes,
        note: timeEntries.note,
        invoiceLineId: timeEntries.invoiceLineId,
      })
      .from(timeEntries)
      .where(eq(timeEntries.projectId, projectId))
      .orderBy(desc(timeEntries.entryDate), desc(timeEntries.createdAt))
      .limit(50);

    const [totals] = await tx
      .select({
        trackedMinutes: sql<number>`coalesce(sum(duration_minutes), 0)::int`,
        unbilledMinutes: sql<number>`coalesce(sum(duration_minutes) filter (where invoice_line_id is null), 0)::int`,
      })
      .from(timeEntries)
      .where(eq(timeEntries.projectId, projectId));

    const [profile] = await tx
      .select({ defaultRate: orgProfiles.defaultHourlyRateOere })
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, ctx.orgId))
      .limit(1);
    const rate = company?.hourlyRateOere ?? profile?.defaultRate ?? 0;
    const trackedMinutes = Number(totals?.trackedMinutes ?? 0);

    return {
      project,
      company,
      tasks: projectTasks,
      recentTime,
      trackedMinutes,
      unbilledMinutes: Number(totals?.unbilledMinutes ?? 0),
      trackedValueOere: Math.round((trackedMinutes * rate) / 60),
    };
  });
}

export async function createProject(ctx: OrgContext, input: ProjectInput) {
  return withOrgContext(ctx, async (tx) => {
    if (input.companyId) await assertCompanyInOrg(tx, input.companyId);
    const [created] = await tx
      .insert(projects)
      .values({
        orgId: ctx.orgId,
        name: input.name,
        companyId: input.companyId ?? null,
        description: input.description ?? null,
        deadline: input.deadline ?? null,
        budgetMinutes: input.budgetMinutes ?? null,
        budgetAmountOere: input.budgetAmountOere ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: projects.id });
    if (!created) throw new Error("project insert returned no row");
    return created.id;
  });
}

export async function updateProject(ctx: OrgContext, projectId: string, input: ProjectInput) {
  return withOrgContext(ctx, async (tx) => {
    await getProjectOrThrow(tx, projectId);
    if (input.companyId) await assertCompanyInOrg(tx, input.companyId);
    await tx
      .update(projects)
      .set({
        name: input.name,
        companyId: input.companyId ?? null,
        description: input.description ?? null,
        deadline: input.deadline ?? null,
        budgetMinutes: input.budgetMinutes ?? null,
        budgetAmountOere: input.budgetAmountOere ?? null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
  });
}

export async function setProjectStatus(ctx: OrgContext, projectId: string, status: ProjectStatus) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .update(projects)
      .set({ status, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning({ id: projects.id });
    if (result.length === 0) throw new Error("PROJECT_NOT_FOUND");
  });
}

export async function deleteProject(ctx: OrgContext, projectId: string) {
  return withOrgContext(ctx, async (tx) => {
    // Tasks cascade; time entries keep their hours and lose the link.
    const result = await tx
      .delete(projects)
      .where(eq(projects.id, projectId))
      .returning({ id: projects.id });
    return result.length > 0;
  });
}

/* ------------------------------- Tasks ------------------------------ */

export async function addTask(ctx: OrgContext, projectId: string, title: string, dueDate?: string | null) {
  return withOrgContext(ctx, async (tx) => {
    await getProjectOrThrow(tx, projectId);
    const [max] = await tx
      .select({ position: sql<number>`coalesce(max(position), -1)::int` })
      .from(tasks)
      .where(eq(tasks.projectId, projectId));
    const [created] = await tx
      .insert(tasks)
      .values({
        orgId: ctx.orgId,
        projectId,
        title,
        dueDate: dueDate ?? null,
        position: (max?.position ?? -1) + 1,
        createdBy: ctx.userId,
      })
      .returning({ id: tasks.id });
    return created?.id ?? null;
  });
}

export async function setTaskDone(ctx: OrgContext, taskId: string, isDone: boolean) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .update(tasks)
      .set({ isDone, doneAt: isDone ? new Date() : null, updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id });
    if (result.length === 0) throw new Error("TASK_NOT_FOUND");
  });
}

export async function deleteTask(ctx: OrgContext, taskId: string) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx.delete(tasks).where(eq(tasks.id, taskId)).returning({ id: tasks.id });
    return result.length > 0;
  });
}

/** Projects available in the time form: active only, company name attached. */
export async function listActiveProjectsForPicker(ctx: OrgContext) {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: projects.id,
        name: projects.name,
        companyId: projects.companyId,
        companyName: companies.name,
      })
      .from(projects)
      .leftJoin(companies, eq(companies.id, projects.companyId))
      .where(eq(projects.status, "active"))
      .orderBy(asc(projects.name)),
  );
}

