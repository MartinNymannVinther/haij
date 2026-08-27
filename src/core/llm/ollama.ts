import {
  LlmError,
  type LlmCompletion,
  type LlmCompletionOptions,
  type LlmHealth,
  type LlmMessage,
  type LlmProvider,
} from "./types";

type FetchLike = typeof fetch;

type ChatResponse = {
  model?: string;
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
};

/**
 * Local/self-hosted provider speaking the Ollama API. Data never leaves
 * the machine (or the VPS) it runs on — the digital-sovereignty option.
 */
export class OllamaProvider implements LlmProvider {
  readonly id = "ollama";
  readonly label = "Ollama (lokal)";

  constructor(
    private readonly baseUrl: string,
    readonly model: string = "llama3.2",
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  async complete(
    messages: LlmMessage[],
    options: LlmCompletionOptions = {},
  ): Promise<LlmCompletion> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          ...(options.responseFormat === "json" ? { format: "json" } : {}),
          options: {
            temperature: options.temperature ?? 0.2,
            num_predict: options.maxTokens ?? 1024,
          },
        }),
        // Local models can be slow to first load; be patient.
        signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
      });
    } catch {
      throw new LlmError("unreachable", "ollama: endpoint did not answer");
    }

    if (!response.ok) {
      throw new LlmError("bad_response", `ollama: HTTP ${response.status}`);
    }
    let payload: ChatResponse;
    try {
      payload = (await response.json()) as ChatResponse;
    } catch {
      throw new LlmError("bad_response", "ollama: malformed response body");
    }
    const content = payload.message?.content;
    if (typeof content !== "string") {
      throw new LlmError("bad_response", "ollama: response carried no content");
    }
    return {
      content,
      model: payload.model ?? this.model,
      usage:
        payload.prompt_eval_count != null
          ? {
              inputTokens: payload.prompt_eval_count ?? 0,
              outputTokens: payload.eval_count ?? 0,
            }
          : null,
    };
  }

  async healthCheck(): Promise<LlmHealth> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      return {
        ok: false,
        reason: "unreachable",
        detail: `no Ollama endpoint at ${this.baseUrl}`,
      };
    }
    if (!response.ok) {
      return { ok: false, reason: "unreachable", detail: `HTTP ${response.status}` };
    }
    try {
      const payload = (await response.json()) as { models?: Array<{ name?: string }> };
      const names = (payload.models ?? []).map((m) => m.name ?? "");
      const present = names.some(
        (name) => name === this.model || name.startsWith(`${this.model}:`),
      );
      if (!present) {
        return {
          ok: false,
          reason: "config",
          detail: `model ${this.model} is not pulled (ollama pull ${this.model})`,
        };
      }
    } catch {
      return { ok: false, reason: "unreachable", detail: "malformed response from Ollama" };
    }
    return { ok: true, detail: `reachable, model ${this.model}` };
  }
}
