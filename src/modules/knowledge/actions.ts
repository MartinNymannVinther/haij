"use server";

import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import {
  addSource,
  deleteSource,
  fetchKnowledge,
  generateDigest,
  setSourceActive,
  type KnowledgeFetchResult,
} from "./service";

type ActionError = "unauthorized" | "invalid" | "notFound" | "limit" | "generic";

export type KnowledgeActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

const Id = z.string().min(1).max(64);

function toError(error: unknown): ActionError {
  if (error instanceof Error && error.message === "SOURCE_NOT_FOUND") return "notFound";
  if (error instanceof Error && error.message === "SOURCE_LIMIT") return "limit";
  console.error("knowledge: action failed", error);
  return "generic";
}

const SourceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.url().max(1000),
});

export async function addKnowledgeSourceAction(input: unknown): Promise<KnowledgeActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = SourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    await addSource(ctx, parsed.data.name, parsed.data.url);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

export async function setKnowledgeSourceActiveAction(
  sourceId: unknown,
  active: unknown,
): Promise<KnowledgeActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(sourceId);
  const flag = z.boolean().safeParse(active);
  if (!id.success || !flag.success) return { ok: false, error: "invalid" };

  try {
    await setSourceActive(ctx, id.data, flag.data);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

export async function deleteKnowledgeSourceAction(sourceId: unknown): Promise<KnowledgeActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const id = Id.safeParse(sourceId);
  if (!id.success) return { ok: false, error: "invalid" };

  try {
    const deleted = await deleteSource(ctx, id.data);
    return deleted ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const fetching = new Set<string>();

export async function fetchKnowledgeAction(): Promise<KnowledgeActionResult<KnowledgeFetchResult>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (fetching.has(ctx.orgId)) return { ok: false, error: "generic" };
  fetching.add(ctx.orgId);
  try {
    const result = await fetchKnowledge(ctx);
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toError(error) };
  } finally {
    fetching.delete(ctx.orgId);
  }
}

export type DigestOutcome = { created: true } | { created: false; reason: string };

export async function generateDigestAction(): Promise<KnowledgeActionResult<DigestOutcome>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };

  try {
    const result = await generateDigest(ctx);
    if ("error" in result) return { ok: true, data: { created: false, reason: result.error } };
    return { ok: true, data: { created: true } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}
