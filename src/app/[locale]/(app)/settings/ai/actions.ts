"use server";

import { requireOrgContext } from "@/core/auth/guard";
import { getLlmProvider, LlmError } from "@/core/llm";

export type LlmTestResult =
  | { status: "none" }
  | { status: "ok"; model: string; sample: string }
  | { status: "failed"; reason: "auth" | "unreachable" | "config" | "generic"; detail: string };

/**
 * Two-step probe: a token-free health check first, then a one-word
 * completion so the whole path (auth, model, response parsing) is
 * proven. Details stay generic — no key material ever leaves the server.
 */
export async function testLlmAction(): Promise<LlmTestResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { status: "failed", reason: "generic", detail: "unauthorized" };

  const provider = getLlmProvider();
  if (!provider) return { status: "none" };

  const health = await provider.healthCheck();
  if (!health.ok) {
    return { status: "failed", reason: health.reason, detail: health.detail };
  }

  try {
    const completion = await provider.complete(
      [
        {
          role: "user",
          content: "Svar med præcis ét ord: OK",
        },
      ],
      { maxTokens: 10, temperature: 0 },
    );
    return {
      status: "ok",
      model: completion.model,
      sample: completion.content.trim().slice(0, 80),
    };
  } catch (error) {
    if (error instanceof LlmError) {
      const reason =
        error.reason === "auth"
          ? "auth"
          : error.reason === "unreachable"
            ? "unreachable"
            : "generic";
      return { status: "failed", reason, detail: error.message };
    }
    console.error("llm: test failed", error);
    return { status: "failed", reason: "generic", detail: "unexpected error" };
  }
}
