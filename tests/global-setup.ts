import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Resets the database and runs all migrations from scratch before the test
 * run. audit_log is append-only (even for superusers), so a fresh schema is
 * the only clean slate — which conveniently also proves that a fresh
 * checkout can migrate from zero.
 *
 * Afterwards the runtime roles get LOGIN + the passwords embedded in the
 * APP/AUTH database URLs, so tests (and CI) need no separate provisioning.
 */
export default async function globalSetup() {
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  if (!migrationUrl) throw new Error("MIGRATION_DATABASE_URL is not set");

  const admin = new Pool({ connectionString: migrationUrl, max: 1 });
  try {
    await admin.query("drop schema if exists public cascade");
    await admin.query("create schema public");
    await admin.query("drop schema if exists drizzle cascade");

    await migrate(drizzle(admin), { migrationsFolder: "./drizzle" });

    for (const envName of ["APP_DATABASE_URL", "AUTH_DATABASE_URL"] as const) {
      const url = process.env[envName];
      if (!url) throw new Error(`${envName} is not set`);
      const { username, password } = new URL(url);
      await admin.query(
        `alter role ${username} login password '${decodeURIComponent(password).replaceAll("'", "''")}'`,
      );
    }
  } finally {
    await admin.end();
  }
}
