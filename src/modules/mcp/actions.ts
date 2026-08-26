"use server";

import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { createApiKey, revokeApiKey } from "./keys";

type ActionError = "unauthorized" | "invalid" | "notFound" | "generic";

export type McpActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

export async function createApiKeyAction(
  name: unknown,
): Promise<McpActionResult<{ plaintext: string; keyPrefix: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = z.string().trim().min(1).max(100).safeParse(name);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    const key = await createApiKey(ctx, parsed.data);
    // The plaintext crosses the wire exactly once, to the creating user.
    return { ok: true, data: { plaintext: key.plaintext, keyPrefix: key.keyPrefix } };
  } catch (error) {
    console.error("mcp: create key failed", error);
    return { ok: false, error: "generic" };
  }
}

export async function revokeApiKeyAction(keyId: unknown): Promise<McpActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = z.string().min(1).max(64).safeParse(keyId);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    await revokeApiKey(ctx, parsed.data);
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "KEY_NOT_FOUND") {
      return { ok: false, error: "notFound" };
    }
    console.error("mcp: revoke key failed", error);
    return { ok: false, error: "generic" };
  }
}
