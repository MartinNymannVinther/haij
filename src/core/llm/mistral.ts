import {
  LlmError,
  type LlmCompletion,
  type LlmCompletionOptions,
  type LlmHealth,
  type LlmMessage,
  type LlmProvider,
} from "./types";

type FetchLike = typeof fetch;

const BASE_URL = "https://api.mistral.ai/v1";

type ChatResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/**
 * EU-hosted provider (Mistral, Paris). The API key is a secret: it is
 * read from the environment, sent only as the Authorization header, and
 * never appears in errors or logs.
 */
export class MistralProvider implements LlmProvider {
  readonly id = "mistral";
  readonly label = "Mistral (EU)";

  constructor(
    private readonly apiKey: string,
    readonly model: string = "mistral-small-latest",
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async complete(
    messages: LlmMessage[],
    options: LlmCompletionOptions = {},
  ): Promise<LlmCompletion> {
    let response: Response;
    try {
      response = await this.fetchFn(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens ?? 1024,
          ...(options.responseFormat === "json"
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
    } catch {
      throw new LlmError("unreachable", "mistral: network error or timeout");
    }

    if (response.status === 401 || response.status === 403) {
      throw new LlmError("auth", "mistral: the API key was rejected");
    }
    if (response.status === 429) {
      throw new LlmError("rate_limit", "mistral: rate limited");
    }
    if (!response.ok) {
      throw new LlmError("bad_response", `mistral: HTTP ${response.status}`);
    }

    let payload: ChatResponse;
    try {
      payload = (await response.json()) as ChatResponse;
    } catch {
      throw new LlmError("bad_response", "mistral: malformed response body");
    }
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new LlmError("bad_response", "mistral: response carried no content");
    }
    return {
      content,
      model: payload.model ?? this.model,
      usage:
        payload.usage?.prompt_tokens != null
          ? {
              inputTokens: payload.usage.prompt_tokens ?? 0,
              outputTokens: payload.usage.completion_tokens ?? 0,
            }
          : null,
    };
  }

  /** GET /models validates the key and reachability without token spend. */
  async healthCheck(): Promise<LlmHealth> {
    let response: Response;
    try {
      response = await this.fetchFn(`${BASE_URL}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { ok: false, reason: "unreachable", detail: "api.mistral.ai did not answer" };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "auth", detail: "the API key was rejected" };
    }
    if (!response.ok) {
      return { ok: false, reason: "unreachable", detail: `HTTP ${response.status}` };
    }
    return { ok: true, detail: `authenticated, model ${this.model}` };
  }
}
