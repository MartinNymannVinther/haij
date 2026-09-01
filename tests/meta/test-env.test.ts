import { describe, expect, it } from "vitest";
import { getCvrProvider } from "@/core/cvr";
import { getLlmProvider } from "@/core/llm";
import { env } from "@/core/env";
import { databaseName, maintenanceUrl, resolveTestDatabaseUrls } from "../test-env";

/**
 * The guard that keeps a test run away from somebody's working database.
 * It has to hold for the mistakes people actually make: running the suite
 * with a normal .env, and pointing an override at the wrong place.
 */

const dev = {
  MIGRATION_DATABASE_URL: "postgres://postgres:postgres@localhost:5432/haij",
  APP_DATABASE_URL: "postgres://haij_app:haij_app@localhost:5432/haij",
  AUTH_DATABASE_URL: "postgres://haij_auth:haij_auth@localhost:5432/haij",
};

describe("resolveTestDatabaseUrls", () => {
  it("sends an ordinary .env to the _test sibling, keeping server and credentials", () => {
    const resolved = resolveTestDatabaseUrls({ ...dev });
    expect(databaseName(resolved.MIGRATION_DATABASE_URL)).toBe("haij_test");
    expect(databaseName(resolved.APP_DATABASE_URL)).toBe("haij_test");
    expect(resolved.APP_DATABASE_URL).toContain("haij_app:haij_app@localhost:5432");
  });

  it("leaves a name that is already a test database alone", () => {
    const resolved = resolveTestDatabaseUrls({
      ...dev,
      MIGRATION_DATABASE_URL: "postgres://postgres:postgres@localhost:5432/haij_test",
    });
    expect(databaseName(resolved.MIGRATION_DATABASE_URL)).toBe("haij_test");
  });

  it("honours an explicit override, so a separate server can be used", () => {
    const resolved = resolveTestDatabaseUrls({
      ...dev,
      TEST_MIGRATION_DATABASE_URL: "postgres://postgres:postgres@ci-host:5432/anything_test",
    });
    expect(resolved.MIGRATION_DATABASE_URL).toContain("ci-host");
  });

  it("refuses an override that does not name a test database", () => {
    expect(() =>
      resolveTestDatabaseUrls({
        ...dev,
        TEST_APP_DATABASE_URL: "postgres://haij_app:haij_app@localhost:5432/haij",
      }),
    ).toThrow(/not a test database/);
  });

  it("refuses an override aimed straight at the working database", () => {
    // Same URL as the dev one, but named _test on the way in: the suffix
    // rule alone would let this through.
    expect(() =>
      resolveTestDatabaseUrls({
        ...dev,
        APP_DATABASE_URL: "postgres://haij_app:haij_app@localhost:5432/haij_test",
        TEST_APP_DATABASE_URL: "postgres://haij_app:haij_app@localhost:5432/haij_test",
      }),
    ).toThrow(/same database/);
  });

  it("says what is missing rather than running against nothing", () => {
    expect(() => resolveTestDatabaseUrls({})).toThrow(/needs a database it may erase/);
  });
});

describe("maintenanceUrl", () => {
  it("points at the postgres database on the same server, so the test one can be created", () => {
    expect(maintenanceUrl("postgres://postgres:pw@localhost:5432/haij_test")).toBe(
      "postgres://postgres:pw@localhost:5432/postgres",
    );
  });
});

/**
 * Nothing in the suite reaches the outside world, whoever runs it.
 *
 * dotenv loads the developer's own .env, so a machine with a real Mistral
 * key or CVR access would otherwise make paid calls from a test run and
 * change what the assertions mean. It happened once: a signals test scored
 * three signals against the live model on one laptop and zero everywhere
 * else. vitest.config.mts pins the providers off; this proves the pin is
 * still there.
 */
describe("outbound providers", () => {
  it("are off no matter what the local .env says", () => {
    expect(env.LLM_PROVIDER).toBe("none");
    expect(env.CVR_PROVIDER).toBe("none");
    expect(getLlmProvider()).toBeNull();
    expect(getCvrProvider()).toBeNull();
  });
});
