"use server";

import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { PROJECT_STATUSES } from "@/core/db/schema";
import {
  addTask,
  createProject,
  deleteProject,
  deleteTask,
  setProjectStatus,
  setTaskDone,
  updateProject,
} from "./service";

type ActionError = "unauthorized" | "invalid" | "notFound" | "generic";

export type ProjectActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

const Id = z.string().min(1).max(64);

function toError(error: unknown): ActionError {
  if (
    error instanceof Error &&
    ["PROJECT_NOT_FOUND", "COMPANY_NOT_FOUND", "TASK_NOT_FOUND"].includes(error.message)
  ) {
    return "notFound";
  }
  console.error("projects: action failed", error);
  return "generic";
}

const ProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  companyId: Id.nullish().transform((v) => v ?? null),
  description: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v.length > 0 ? v : null))
    .nullish()
    .transform((v) => v ?? null),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((v) => v ?? null),
  budgetMinutes: z.number().int().min(1).max(10_000_000).nullish().transform((v) => v ?? null),
  budgetAmountOere: z
    .number()
    .int()
    .min(1)
    .max(100_000_000_000)
    .nullish()
    .transform((v) => v ?? null),
});

export async function createProjectAction(
  input: unknown,
): Promise<ProjectActionResult<{ projectId: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = ProjectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    const projectId = await createProject(ctx, parsed.data);
    return { ok: true, data: { projectId } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

export async function updateProjectAction(
  projectId: unknown,
  input: unknown,
): Promise<ProjectActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(projectId);
  const parsed = ProjectSchema.safeParse(input);
  if (!id.success || !parsed.success) return { ok: false, error: "invalid" };

  try {
    await updateProject(ctx, id.data, parsed.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

export async function setProjectStatusAction(
  projectId: unknown,
  status: unknown,
): Promise<ProjectActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(projectId);
  const parsedStatus = z.enum(PROJECT_STATUSES).safeParse(status);
  if (!id.success || !parsedStatus.success) return { ok: false, error: "invalid" };

  try {
    await setProjectStatus(ctx, id.data, parsedStatus.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

export async function deleteProjectAction(projectId: unknown): Promise<ProjectActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(projectId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    const deleted = await deleteProject(ctx, id.data);
    return deleted ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const TaskSchema = z.object({
  projectId: Id,
  title: z.string().trim().min(1).max(300),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((v) => v ?? null),
});

export async function addTaskAction(input: unknown): Promise<ProjectActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = TaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    await addTask(ctx, parsed.data.projectId, parsed.data.title, parsed.data.dueDate);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

export async function setTaskDoneAction(
  taskId: unknown,
  isDone: unknown,
): Promise<ProjectActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(taskId);
  const done = z.boolean().safeParse(isDone);
  if (!id.success || !done.success) return { ok: false, error: "invalid" };

  try {
    await setTaskDone(ctx, id.data, done.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

export async function deleteTaskAction(taskId: unknown): Promise<ProjectActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(taskId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    const deleted = await deleteTask(ctx, id.data);
    return deleted ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}
