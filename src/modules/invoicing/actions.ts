"use server";

import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { INVOICE_UNITS, VAT_CATEGORIES } from "@/core/db/schema";
import { normalizeCvr } from "@/core/cvr";
import { setCustomerFrame, setRevenueTarget } from "./economy";
import { upsertOrgProfile } from "./profile";
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
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

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

export async function createDraftFromTimeAction(
  companyId: unknown,
): Promise<InvoicingResult<{ invoiceId: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(companyId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    const invoiceId = await createDraftFromTime(ctx, id.data);
    return { ok: true, data: { invoiceId } };
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
