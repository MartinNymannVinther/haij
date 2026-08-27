"use server";

import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { INVOICE_UNITS, VAT_CATEGORIES } from "@/core/db/schema";
import { normalizeCvr } from "@/core/cvr";
import { setCustomerFrame, setRevenueTarget } from "./economy";
import { deleteOrgLogo, saveOrgLogo, LOGO_CONTENT_TYPES, LOGO_MAX_BYTES } from "./logo";
import { upsertOrgProfile } from "./profile";
import { createRole, deleteRole, updateRole } from "./roles";
import {
  addLine,
  createCreditNote,
  createDraft,
  createDraftFromTime,
  deleteDraft,
  issueInvoice,
  markPaid,
  markSent,
  removeLine,
  unbilledSummary,
  updateDraft,
  updateLine,
  type InvoiceError,
} from "./service";

type ActionError =
  | "unauthorized"
  | "invalid"
  | "notFound"
  | "notDraft"
  | "notIssued"
  | "noLines"
  | "noCompany"
  | "profileMissing"
  | "noUnbilledTime"
  | "generic";

export type InvoicingResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: ActionError };

const DOMAIN_ERRORS: Record<InvoiceError, ActionError> = {
  INVOICE_NOT_FOUND: "notFound",
  INVOICE_NOT_DRAFT: "notDraft",
  INVOICE_NOT_ISSUED: "notIssued",
  INVOICE_NO_LINES: "noLines",
  INVOICE_NO_COMPANY: "noCompany",
  PROFILE_MISSING: "profileMissing",
  COMPANY_NOT_FOUND: "notFound",
  NO_UNBILLED_TIME: "noUnbilledTime",
};

function toActionError(error: unknown): ActionError {
  if (error instanceof Error && error.message in DOMAIN_ERRORS) {
    return DOMAIN_ERRORS[error.message as InvoiceError];
  }
  console.error("invoicing: action failed", error);
  return "generic";
}

const Id = z.string().min(1).max(64);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length > 0 ? value : null))
    .nullish()
    .transform((value) => value ?? null);

/* ---------------------------- Org profile --------------------------- */

const ProfileSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  cvr: z.string().trim(),
  address: z.string().trim().min(1).max(300),
  zipcode: z.string().trim().min(3).max(10),
  city: z.string().trim().min(1).max(100),
  email: optionalText(320),
  phone: optionalText(30),
  bankReg: optionalText(10),
  bankKonto: optionalText(20),
  defaultPaymentTermsDays: z.number().int().min(0).max(120),
  defaultHourlyRateOere: z.number().int().min(0).max(100_000_000).nullable(),
});

export async function saveOrgProfileAction(input: unknown): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = ProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const cvr = normalizeCvr(parsed.data.cvr);
  if (!cvr) return { ok: false, error: "invalid" };

  try {
    await upsertOrgProfile(ctx, { ...parsed.data, cvr });
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------ Drafts ------------------------------ */

export async function createDraftAction(
  companyId?: unknown,
): Promise<InvoicingResult<{ invoiceId: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = companyId == null ? null : Id.safeParse(companyId);
  if (id && !id.success) return { ok: false, error: "invalid" };

  try {
    const invoiceId = await createDraft(ctx, id?.data ?? null);
    return { ok: true, data: { invoiceId } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

const DateRangeSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((v) => v ?? null),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((v) => v ?? null),
});

export async function createDraftFromTimeAction(
  companyId: unknown,
  range?: unknown,
): Promise<InvoicingResult<{ invoiceId: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(companyId);
  const parsedRange = DateRangeSchema.safeParse(range ?? {});
  if (!id.success || !parsedRange.success) return { ok: false, error: "invalid" };

  try {
    const invoiceId = await createDraftFromTime(ctx, id.data, parsedRange.data);
    return { ok: true, data: { invoiceId } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function unbilledSummaryAction(
  companyId: unknown,
  range?: unknown,
): Promise<InvoicingResult<{ minutes: number; entries: number }>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(companyId);
  const parsedRange = DateRangeSchema.safeParse(range ?? {});
  if (!id.success || !parsedRange.success) return { ok: false, error: "invalid" };

  try {
    const summary = await unbilledSummary(ctx, id.data, parsedRange.data);
    return { ok: true, data: summary };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

const DraftUpdateSchema = z.object({
  companyId: Id.nullish().transform((v) => v ?? undefined),
  note: optionalText(2000).optional(),
  paymentTermsDays: z.number().int().min(0).max(120).optional(),
  deliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((v) => v ?? null)
    .optional(),
  buyerReference: optionalText(200).optional(),
  buyerEanGln: optionalText(20).optional(),
});

export async function updateDraftAction(
  invoiceId: unknown,
  input: unknown,
): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(invoiceId);
  const parsed = DraftUpdateSchema.safeParse(input);
  if (!id.success || !parsed.success) return { ok: false, error: "invalid" };

  try {
    await updateDraft(ctx, id.data, parsed.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteDraftAction(invoiceId: unknown): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(invoiceId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    await deleteDraft(ctx, id.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------ Lines ------------------------------- */

const LineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantityHundredths: z
    .number()
    .int()
    .refine((v) => v !== 0, "quantity cannot be zero")
    .refine((v) => Math.abs(v) <= 1_000_000, "quantity out of range"),
  unit: z.enum(INVOICE_UNITS),
  unitPriceOere: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  vatCategory: z.enum(VAT_CATEGORIES),
  vatRateBp: z.number().int().min(0).max(10_000),
});

export async function addLineAction(invoiceId: unknown, input: unknown): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(invoiceId);
  const parsed = LineSchema.safeParse(input);
  if (!id.success || !parsed.success) return { ok: false, error: "invalid" };

  try {
    await addLine(ctx, id.data, parsed.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateLineAction(lineId: unknown, input: unknown): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(lineId);
  const parsed = LineSchema.safeParse(input);
  if (!id.success || !parsed.success) return { ok: false, error: "invalid" };

  try {
    await updateLine(ctx, id.data, parsed.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function removeLineAction(lineId: unknown): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(lineId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    await removeLine(ctx, id.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* --------------------------- Issue & flow --------------------------- */

export async function issueInvoiceAction(
  invoiceId: unknown,
): Promise<InvoicingResult<{ invoiceNumber: number }>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(invoiceId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    const invoiceNumber = await issueInvoice(ctx, id.data);
    return { ok: true, data: { invoiceNumber } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function createCreditNoteAction(
  invoiceId: unknown,
): Promise<InvoicingResult<{ invoiceId: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(invoiceId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    const created = await createCreditNote(ctx, id.data);
    return { ok: true, data: { invoiceId: created } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function markSentAction(invoiceId: unknown): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(invoiceId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    await markSent(ctx, id.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function markPaidAction(invoiceId: unknown): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(invoiceId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    await markPaid(ctx, id.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* --------------------------- Budget & frames ------------------------ */

const TargetSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  revenueTargetOere: z.number().int().min(0).max(100_000_000_000),
});

export async function setRevenueTargetAction(input: unknown): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = TargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    await setRevenueTarget(ctx, parsed.data.year, parsed.data.month, parsed.data.revenueTargetOere);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

const FrameSchema = z.object({
  hourlyRateOere: z.number().int().min(0).max(100_000_000).nullable(),
  budgetMinutes: z.number().int().min(1).max(10_000_000).nullable(),
  budgetAmountOere: z.number().int().min(1).max(100_000_000_000).nullable(),
});

export async function setCustomerFrameAction(
  companyId: unknown,
  input: unknown,
): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(companyId);
  const parsed = FrameSchema.safeParse(input);
  if (!id.success || !parsed.success) return { ok: false, error: "invalid" };

  try {
    const updated = await setCustomerFrame(ctx, id.data, parsed.data);
    return updated ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------ Roller ------------------------------ */

const RoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  hourlyRateOere: z.number().int().min(0).max(100_000_000),
});

export async function createRoleAction(input: unknown): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = RoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    await createRole(ctx, parsed.data.name, parsed.data.hourlyRateOere);
    return { ok: true, data: undefined };
  } catch (error) {
    const code =
      (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") return { ok: false, error: "invalid" }; // name taken
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateRoleAction(roleId: unknown, input: unknown): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(roleId);
  const parsed = RoleSchema.safeParse(input);
  if (!id.success || !parsed.success) return { ok: false, error: "invalid" };

  try {
    const updated = await updateRole(ctx, id.data, parsed.data.name, parsed.data.hourlyRateOere);
    return updated ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteRoleAction(roleId: unknown): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(roleId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    const deleted = await deleteRole(ctx, id.data);
    return deleted ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------- Logo ------------------------------- */

const LogoSchema = z.object({
  contentType: z.enum(LOGO_CONTENT_TYPES),
  /** Raw base64 without the data: prefix. */
  base64: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

export async function saveLogoAction(input: unknown): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = LogoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  // Base64 inflates by 4/3; enforce the decoded ceiling.
  const decodedBytes = Math.floor((parsed.data.base64.length * 3) / 4);
  if (decodedBytes > LOGO_MAX_BYTES) return { ok: false, error: "invalid" };

  try {
    await saveOrgLogo(ctx, parsed.data.base64, parsed.data.contentType);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteLogoAction(): Promise<InvoicingResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };

  try {
    const deleted = await deleteOrgLogo(ctx);
    return deleted ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
