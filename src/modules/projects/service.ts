import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  companies,
  orgProfiles,
  projects,
  roles,
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
  /** Project hourly rate, øre excl. VAT; null falls back to the customer rate. */
  hourlyRateOere?: number | null;
};

/**
 * Value of tracked minutes with the full rate hierarchy resolved per
 * entry in SQL: role -> task -> project -> customer -> org default.
 * Mirrors resolveHourlyRateOere in the invoicing module.
 */
function entryValueSql(defaultRateOere: number) {
  return sql<number>`coalesce(sum(round(${timeEntries.durationMinutes} * coalesce(${roles.hourlyRateOere}, ${tasks.hourlyRateOere}, ${projects.hourlyRateOere}, ${companies.hourlyRateOere}, ${defaultRateOere}, 0) / 60.0)), 0)::bigint`;
}

async function orgDefaultRate(tx: AppTransaction, orgId: string): Promise<number> {
  const [profile] = await tx
    .select({ defaultRate: orgProfiles.defaultHourlyRateOere })
    .from(orgProfiles)
    .where(eq(orgProfiles.orgId, orgId))
    .limit(1);
  return profile?.defaultRate ?? 0;
}

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
 * Projects with consumption: tracked minutes and their value at the
 * per-entry resolved rate (excl. VAT). The value is what the amount
 * frame is monitored against until invoices carry project ids.
 */
export async function listProjects(ctx: OrgContext, status?: ProjectStatus) {
  return withOrgContext(ctx, async (tx): Promise<ProjectListRow[]> => {
    const defaultRate = await orgDefaultRate(tx, ctx.orgId);

    const time = tx
      .select({
        projectId: timeEntries.projectId,
        trackedMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`.as(
          "tracked_minutes",
        ),
        valueOere: entryValueSql(defaultRate).as("value_oere"),
      })
      .from(timeEntries)
      .leftJoin(roles, eq(roles.id, timeEntries.roleId))
      .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .leftJoin(projects, eq(projects.id, timeEntries.projectId))
      .leftJoin(companies, eq(companies.id, timeEntries.companyId))
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
        hourlyRateOere: projects.hourlyRateOere,
        trackedMinutes: sql<number>`coalesce(${time.trackedMinutes}, 0)::int`,
        trackedValueOere: sql<number>`coalesce(${time.valueOere}, 0)::bigint`,
        openTasks: sql<number>`coalesce(${taskCounts.openTasks}, 0)::int`,
        doneTasks: sql<number>`coalesce(${taskCounts.doneTasks}, 0)::int`,
      })
      .from(projects)
      .leftJoin(companies, eq(companies.id, projects.companyId))
      .leftJoin(time, eq(time.projectId, projects.id))
      .leftJoin(taskCounts, eq(taskCounts.projectId, projects.id))
      .where(status ? eq(projects.status, status) : undefined)
      .orderBy(asc(projects.status), desc(projects.updatedAt));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status as ProjectStatus,
      companyId: row.companyId,
      companyName: row.companyName,
      deadline: row.deadline,
      budgetMinutes: row.budgetMinutes,
      budgetAmountOere: row.budgetAmountOere,
      trackedMinutes: Number(row.trackedMinutes),
      trackedValueOere: Number(row.trackedValueOere),
      openTasks: Number(row.openTasks),
      doneTasks: Number(row.doneTasks),
    }));
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

    const defaultRate = await orgDefaultRate(tx, ctx.orgId);
    const [totals] = await tx
      .select({
        trackedMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
        unbilledMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.invoiceLineId} is null), 0)::int`,
        valueOere: entryValueSql(defaultRate),
      })
      .from(timeEntries)
      .leftJoin(roles, eq(roles.id, timeEntries.roleId))
      .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .leftJoin(projects, eq(projects.id, timeEntries.projectId))
      .leftJoin(companies, eq(companies.id, timeEntries.companyId))
      .where(eq(timeEntries.projectId, projectId));

    return {
      project,
      company,
      tasks: projectTasks,
      recentTime,
      trackedMinutes: Number(totals?.trackedMinutes ?? 0),
      unbilledMinutes: Number(totals?.unbilledMinutes ?? 0),
      trackedValueOere: Number(totals?.valueOere ?? 0),
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
        hourlyRateOere: input.hourlyRateOere ?? null,
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
        hourlyRateOere: input.hourlyRateOere ?? null,
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

export type TaskInput = {
  title: string;
  dueDate?: string | null;
  /** Task hourly rate, øre excl. VAT; null falls back to project/customer. */
  hourlyRateOere?: number | null;
};

export async function addTask(ctx: OrgContext, projectId: string, input: TaskInput) {
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
        title: input.title,
        dueDate: input.dueDate ?? null,
        hourlyRateOere: input.hourlyRateOere ?? null,
        position: (max?.position ?? -1) + 1,
        createdBy: ctx.userId,
      })
      .returning({ id: tasks.id });
    return created?.id ?? null;
  });
}

export async function setTaskRate(ctx: OrgContext, taskId: string, hourlyRateOere: number | null) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .update(tasks)
      .set({ hourlyRateOere, updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id });
    if (result.length === 0) throw new Error("TASK_NOT_FOUND");
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

/** Open tasks of active projects, for the task picker in the time form. */
export async function listOpenTasksForPicker(ctx: OrgContext) {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(tasks.isDone, false), eq(projects.status, "active")))
      .orderBy(asc(tasks.position), asc(tasks.createdAt)),
  );
}
