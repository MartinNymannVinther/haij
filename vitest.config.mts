import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { resolveTestDatabaseUrls } from "./tests/test-env";

/**
 * Every database URL the suite sees points at a `_test` sibling, never at
 * the one in `.env`. Resolved here so it applies to the workers, to the
 * global setup, and to the application's own connection pools when a test
 * calls a service function. Throws if the result is not clearly a test
 * database — the suite drops the whole schema, and once was enough.
 *
 * Vite's native config loader prints an advisory about importing a .ts
 * file here. Harmless: the alternatives are duplicating the guard or
 * dropping its types, and neither is worth a quieter startup.
 */
const testDatabaseUrls = resolveTestDatabaseUrls();
Object.assign(process.env, testDatabaseUrls);

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // The suite must not depend on whoever is running it. dotenv loads the
    // developer's .env above, so anything that reaches the outside world is
    // pinned off here: with a real LLM or CVR provider configured locally,
    // the tests make paid API calls and assertions change meaning depending
    // on the machine. SIGNUP is opened because every fixture registers
    // users; that the shipped default is "closed" is proven in
    // tests/auth/signup-gate.
    env: {
      ...testDatabaseUrls,
      SIGNUP: "open",
      LLM_PROVIDER: "none",
      CVR_PROVIDER: "none",
    },
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // The suites share one database; run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
