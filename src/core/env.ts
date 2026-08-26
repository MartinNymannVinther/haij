import { z } from "zod";

/**
 * Server-side environment variables, validated at the boundary.
 * Import this instead of reading process.env directly.
 */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_DATABASE_URL: z.url(),
    AUTH_DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(16),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    // CVR lookup adapter: "virk" (official system-to-system access),
    // "cvrapi" (public cvrapi.dk) or "none" to disable lookups.
    CVR_PROVIDER: z.enum(["virk", "cvrapi", "none"]).default("cvrapi"),
    // Contact shown in the identifying User-Agent required by cvrapi.dk.
    CVR_CONTACT: z.string().min(3).optional(),
    // Credentials for distribution.virk.dk (CVR_PROVIDER=virk).
    VIRK_CVR_USER: z.string().min(1).optional(),
    VIRK_CVR_PASSWORD: z.string().min(1).optional(),
    // LLM adapter (CLAUDE.md: EU-hosted or local models behind an
    // adapter): "mistral" (EU-hosted API), "ollama" (local or
    // self-hosted, Ollama-compatible) or "none" to disable AI features.
    LLM_PROVIDER: z.enum(["mistral", "ollama", "none"]).default("none"),
    // Secret. Lives only in .env locally and in Coolify in production.
    MISTRAL_API_KEY: z.string().min(1).optional(),
    // Model override; sensible per-provider defaults apply when unset.
    LLM_MODEL: z.string().min(1).optional(),
    OLLAMA_BASE_URL: z.url().default("http://localhost:11434"),
    // Bearer secret for the unattended signal-refresh endpoint; the
    // endpoint answers 404 until this is set. pg-boss takes over when
    // Haij is deployed (ADR 0005).
    SIGNALS_CRON_SECRET: z.string().min(16).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.CVR_PROVIDER === "virk" && (!value.VIRK_CVR_USER || !value.VIRK_CVR_PASSWORD)) {
      ctx.addIssue({
        code: "custom",
        message: "CVR_PROVIDER=virk requires VIRK_CVR_USER and VIRK_CVR_PASSWORD",
        path: ["CVR_PROVIDER"],
      });
    }
    if (value.LLM_PROVIDER === "mistral" && !value.MISTRAL_API_KEY) {
      ctx.addIssue({
        code: "custom",
        message: "LLM_PROVIDER=mistral requires MISTRAL_API_KEY",
        path: ["LLM_PROVIDER"],
      });
    }
  });

export const env = EnvSchema.parse(process.env);
