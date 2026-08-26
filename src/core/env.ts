import { z } from "zod";

/**
 * Server-side environment variables, validated at the boundary.
 * Import this instead of reading process.env directly.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_DATABASE_URL: z.url(),
  AUTH_DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
});

export const env = EnvSchema.parse(process.env);
