"use server";

import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { getCvrProvider, normalizeCvr, type CvrCompany } from "@/core/cvr";
import { PIPELINE_STAGES } from "@/core/db/schema";
import {
  addActivity,
  addContact,
  createCompany,
  deleteCompany,
  deleteContact,
  setPipelineStage,
  updateCompany,
} from "./service";

type ActionError =
  | "unauthorized"
  | "invalid"
  | "notFound"
  | "cvrExists"
  | "cvrInvalid"
  | "cvrUnavailable"
  | "throttled"
  | "generic";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length > 0 ? value : null))
    .nullish()
    .transform((value) => value ?? null);

const CompanySchema = z.object({
  name: z.string().trim().min(1).max(200),
  cvr: optionalText(20),
  address: optionalText(300),
  zipcode: optionalText(10),
  city: optionalText(100),
  phone: optionalText(30),
  email: optionalText(320),
  website: optionalText(300),
  industryCode: optionalText(20),
  industryText: optionalText(300),
  companyType: optionalText(100),
  cvrData: z.unknown().optional(),
});

const ContactSchema = z.object({
  companyId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  title: optionalText(200),
  email: optionalText(320),
  phone: optionalText(30),
  isPrimary: z.boolean().optional(),
});

const ActivitySchema = z.object({
  companyId: z.string().min(1).max(64),
  type: z.enum(["note", "call", "meeting", "email"]),
  body: z.string().trim().min(1).max(5000),
});

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code === "23505";
}

function isCompanyNotFound(error: unknown): boolean {
  return error instanceof Error && error.message === "COMPANY_NOT_FOUND";
}

/* --------------------------- CVR lookup ---------------------------- */

// Per-user in-process throttle: polite towards the free quota-limited
// provider. 10 lookups per minute per user.
const lookupWindow = new Map<string, number[]>();

function throttleLookup(userId: string): boolean {
  const now = Date.now();
  const recent = (lookupWindow.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) {
    lookupWindow.set(userId, recent);
    return false;
  }
  recent.push(now);
  lookupWindow.set(userId, recent);
  return true;
}

export type CvrLookupData =
  | { status: "found"; company: Omit<CvrCompany, "raw"> & { raw: unknown } }
  | { status: "not_found" }
  | { status: "unavailable" };

export async function lookupCvrAction(input: string): Promise<ActionResult<CvrLookupData>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };

  const cvr = normalizeCvr(String(input ?? ""));
  if (!cvr) return { ok: false, error: "cvrInvalid" };
  if (!throttleLookup(ctx.userId)) return { ok: false, error: "throttled" };

  const provider = getCvrProvider();
  if (!provider) return { ok: true, data: { status: "unavailable" } };

  const result = await provider.lookup(cvr);
  return { ok: true, data: result };
}

/* --------------------------- Companies ----------------------------- */

export async function createCompanyAction(
  input: unknown,
): Promise<ActionResult<{ companyId: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = CompanySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (parsed.data.cvr && !normalizeCvr(parsed.data.cvr)) {
    return { ok: false, error: "cvrInvalid" };
  }

  try {
    const companyId = await createCompany(
      ctx,
      { ...parsed.data, cvr: parsed.data.cvr ? normalizeCvr(parsed.data.cvr) : null },
      parsed.data.cvrData ? "cvr" : "manual",
    );
    return { ok: true, data: { companyId } };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "cvrExists" };
    console.error("crm: create company failed", error);
    return { ok: false, error: "generic" };
  }
}

export async function updateCompanyAction(
  companyId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = z.string().min(1).max(64).safeParse(companyId);
  const parsed = CompanySchema.safeParse(input);
  if (!id.success || !parsed.success) return { ok: false, error: "invalid" };

  try {
    const updated = await updateCompany(ctx, id.data, {
      ...parsed.data,
      cvr: parsed.data.cvr ? normalizeCvr(parsed.data.cvr) : null,
    });
    return updated ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "cvrExists" };
    console.error("crm: update company failed", error);
    return { ok: false, error: "generic" };
  }
}

export async function setPipelineStageAction(
  companyId: unknown,
  stage: unknown,
): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = z.string().min(1).max(64).safeParse(companyId);
  const parsedStage = z.enum(PIPELINE_STAGES).safeParse(stage);
  if (!id.success || !parsedStage.success) return { ok: false, error: "invalid" };

  try {
    const result = await setPipelineStage(ctx, id.data, parsedStage.data);
    return result ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
  } catch (error) {
    console.error("crm: stage change failed", error);
    return { ok: false, error: "generic" };
  }
}

export async function deleteCompanyAction(companyId: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = z.string().min(1).max(64).safeParse(companyId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    const deleted = await deleteCompany(ctx, id.data);
    return deleted ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
  } catch (error) {
    console.error("crm: delete company failed", error);
    return { ok: false, error: "generic" };
  }
}

/* ---------------------------- Contacts ------------------------------ */

export async function addContactAction(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = ContactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    await addContact(ctx, parsed.data.companyId, parsed.data);
    return { ok: true, data: undefined };
  } catch (error) {
    if (isCompanyNotFound(error)) return { ok: false, error: "notFound" };
    console.error("crm: add contact failed", error);
    return { ok: false, error: "generic" };
  }
}

export async function deleteContactAction(contactId: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = z.string().min(1).max(64).safeParse(contactId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    const deleted = await deleteContact(ctx, id.data);
    return deleted ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
  } catch (error) {
    console.error("crm: delete contact failed", error);
    return { ok: false, error: "generic" };
  }
}

/* ---------------------------- Timeline ------------------------------ */

export async function addActivityAction(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = ActivitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    await addActivity(ctx, parsed.data.companyId, parsed.data.type, parsed.data.body);
    return { ok: true, data: undefined };
  } catch (error) {
    if (isCompanyNotFound(error)) return { ok: false, error: "notFound" };
    console.error("crm: add activity failed", error);
    return { ok: false, error: "generic" };
  }
}
