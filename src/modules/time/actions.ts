"use server";

import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { parseDurationToMinutes } from "./duration";
import { addEntry, deleteEntry } from "./service";

type ActionError = "unauthorized" | "invalid" | "invalidDuration" | "notFound" | "generic";

export type TimeActionResult = { ok: true } | { ok: false; error: ActionError };

const EntrySchema = z.object({
  companyId: z
    .string()
    .trim()
    .max(64)
    .transform((value) => (value.length > 0 ? value : null))
    .nullish()
    .transform((value) => value ?? null),
  projectId: z
    .string()
    .trim()
    .max(64)
    .transform((value) => (value.length > 0 ? value : null))
    .nullish()
    .transform((value) => value ?? null),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration: z.string().trim().min(1).max(20),
  note: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => (value.length > 0 ? value : null))
    .nullish()
    .transform((value) => value ?? null),
});

export async function addTimeEntryAction(input: unknown): Promise<TimeActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = EntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const durationMinutes = parseDurationToMinutes(parsed.data.duration);
  if (durationMinutes === null) return { ok: false, error: "invalidDuration" };

  try {
    await addEntry(ctx, {
      companyId: parsed.data.companyId,
      projectId: parsed.data.projectId,
      entryDate: parsed.data.entryDate,
      durationMinutes,
      note: parsed.data.note,
    });
    return { ok: true };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "COMPANY_NOT_FOUND" || error.message === "PROJECT_NOT_FOUND")
    ) {
      return { ok: false, error: "notFound" };
    }
    console.error("time: add entry failed", error);
    return { ok: false, error: "generic" };
  }
}

export async function deleteTimeEntryAction(entryId: unknown): Promise<TimeActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = z.string().min(1).max(64).safeParse(entryId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    const deleted = await deleteEntry(ctx, id.data);
    return deleted ? { ok: true } : { ok: false, error: "notFound" };
  } catch (error) {
    console.error("time: delete entry failed", error);
    return { ok: false, error: "generic" };
  }
}
