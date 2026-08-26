import { env } from "@/core/env";
import { MistralProvider } from "./mistral";
import { OllamaProvider } from "./ollama";
import type { LlmProvider } from "./types";

export { LlmError } from "./types";
export type {
  LlmCompletion,
  LlmCompletionOptions,
  LlmHealth,
  LlmMessage,
  LlmProvider,
} from "./types";

/**
 * Provider registry, same pattern as the CVR adapter: the environment
 * decides, features just ask. Returns null when AI is disabled
 * (LLM_PROVIDER=none, the default) — callers must handle that and
 * degrade gracefully.
 */
export function getLlmProvider(): LlmProvider | null {
  switch (env.LLM_PROVIDER) {
    case "mistral":
      // env validation guarantees the key is present for this provider.
      return new MistralProvider(env.MISTRAL_API_KEY!, env.LLM_MODEL ?? "mistral-small-latest");
    case "ollama":
      return new OllamaProvider(env.OLLAMA_BASE_URL, env.LLM_MODEL ?? "llama3.2");
    case "none":
      return null;
  }
}
