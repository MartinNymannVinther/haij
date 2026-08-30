"use server";

import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { normalizeCvr } from "@/core/cvr";
import { checkFeed, type FeedCheck } from "./feed-check";
import { SIGNAL_STATUSES } from "@/core/db/schema";
import {
  addManualSignal,
  convertSignalToCompany,
  refreshSignals,
  saveSignalSettings,
  setSignalFollowUp,
  setSignalStatus,
  type RefreshResult,
} from "./service";

type ActionError = "unauthorized" | "invalid" | "notFound" | "generic";

export type SignalActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: ActionError };

const Id = z.string().min(1).max(64);

function toError(error: unknown): ActionError {
  if (error instanceof Error && error.message === "SIGNAL_NOT_FOUND") return "notFound";
  console.error("signals: action failed", error);
  return "generic";
}

const SettingsSchema = z.object({
  serviceProfile: z
    .string()
    .trim()
    .max(4000)
    .transform((v) => (v.length > 0 ? v : null))
    .nullish()
    .transform((v) => v ?? null),
  rssFeeds: z
    .array(
      z.object({
        url: z.url().max(1000),
        label: z
          .string()
          .trim()
          .max(100)
          .transform((v) => (v.length > 0 ? v : null))
          .nullish()
          .transform((v) => v ?? null),
      }),
    )
    .max(10)
    .default([]),
  tedKeywords: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v.length > 0 ? v : null))
    .nullish()
    .transform((v) => v ?? null),
  cvrBranchePrefixes: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v.length > 0 ? v : null))
    .nullish()
    .transform((v) => v ?? null),
});

export async function saveSignalSettingsAction(input: unknown): Promise<SignalActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = SettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    await saveSignalSettings(ctx, parsed.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

// One refresh at a time per org, in-process: fetching is slow and a
// double click must not double-fetch.
const refreshing = new Set<string>();

export async function refreshSignalsAction(): Promise<SignalActionResult<RefreshResult>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (refreshing.has(ctx.orgId)) return { ok: false, error: "generic" };
  refreshing.add(ctx.orgId);
  try {
    const result = await refreshSignals(ctx);
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toError(error) };
  } finally {
    refreshing.delete(ctx.orgId);
  }
}

export async function setSignalStatusAction(
  signalId: unknown,
  status: unknown,
): Promise<SignalActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(signalId);
  const parsedStatus = z.enum(SIGNAL_STATUSES).safeParse(status);
  if (!id.success || !parsedStatus.success) return { ok: false, error: "invalid" };

  try {
    await setSignalStatus(ctx, id.data, parsedStatus.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

export async function setSignalFollowUpAction(
  signalId: unknown,
  followUpAt: unknown,
): Promise<SignalActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(signalId);
  const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .safeParse(followUpAt);
  if (!id.success || !date.success) return { ok: false, error: "invalid" };

  try {
    await setSignalFollowUp(ctx, id.data, date.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const ManualSchema = z.object({
  title: z.string().trim().min(1).max(300),
  url: z
    .url()
    .max(1000)
    .nullish()
    .or(z.literal("").transform(() => null))
    .transform((v) => v ?? null),
  note: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v.length > 0 ? v : null))
    .nullish()
    .transform((v) => v ?? null),
  companyCvr: z
    .string()
    .trim()
    .max(20)
    .transform((v) => (v.length > 0 ? v : null))
    .nullish()
    .transform((v) => v ?? null),
});

export async function addManualSignalAction(input: unknown): Promise<SignalActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = ManualSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const cvr = parsed.data.companyCvr ? normalizeCvr(parsed.data.companyCvr) : null;
  if (parsed.data.companyCvr && !cvr) return { ok: false, error: "invalid" };

  try {
    await addManualSignal(ctx, { ...parsed.data, companyCvr: cvr });
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

export async function convertSignalAction(
  signalId: unknown,
): Promise<SignalActionResult<{ companyId: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(signalId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    const companyId = await convertSignalToCompany(ctx, id.data);
    return { ok: true, data: { companyId } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

/**
 * Tries one feed and reports what came back, so a source can be verified
 * when it is added rather than days later when nothing has arrived.
 * Reaching an arbitrary URL is the whole point, so it is gated on an
 * org context like every other action, and the reply carries only counts
 * and one sanitized title.
 */
export async function checkFeedAction(url: unknown): Promise<SignalActionResult<FeedCheck>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = z.string().trim().min(1).max(1000).safeParse(url);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    return { ok: true, data: await checkFeed(parsed.data) };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}
