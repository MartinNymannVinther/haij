// Loaded before anything touches @/core/env: a standalone script gets no
// help from Next.js, which normally reads .env for us.
import "dotenv/config";

import { createInterface } from "node:readline/promises";
import { Pool } from "pg";

/**
 * Wipes one organization's business data so it can be taken into real use
 * with clean books. For clearing out trial and test data before day one —
 * not a feature of the running app.
 *
 *     pnpm script scripts/reset-org.ts <org-slug-or-id>            # viser hvad der ryger
 *     pnpm script scripts/reset-org.ts <org-slug-or-id> --confirm  # sletter
 *
 * Deliberately a script and not a button. Issued invoices are immutable
 * and undeletable in the application, enforced by database triggers,
 * because bogføringsloven wants the number sequence unbroken. That rule
 * must not be softened to make a cleanup convenient, so the cleanup lives
 * outside the app instead, runs as the migration role, and switches the
 * triggers off only for the length of one transaction. If you find
 * yourself reaching for this against real books, the answer you want is a
 * credit note.
 *
 * Kept: the organization itself, its members, the company profile and
 * logo, API keys, and the audit log — which records this reset as an
 * event rather than losing the history of what was there.
 *
 * Removed: everything else that belongs to the organization. Run
 * scripts/onboard-vinther.ts afterwards to put the setup back.
 */

const TABLES = [
  // Children before parents; every one is org-scoped.
  "knowledge_digests",
  "knowledge_items",
  "knowledge_sources",
  "signals",
  "signal_settings",
  "time_entries",
  "invoice_lines",
  "invoices",
  "invoice_counters",
  "budgets",
  "tasks",
  "projects",
  "role_rates",
  "roles",
  "activities",
  "contacts",
  "companies",
] as const;

const confirmed = process.argv.includes("--confirm");
const target = process.argv[2];

async function main() {
  if (!target || target.startsWith("--")) {
    throw new Error("Angiv organisationens slug eller id: pnpm script scripts/reset-org.ts <org>");
  }
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL mangler i .env");

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const orgs = await pool.query<{ id: string; name: string; slug: string }>(
      `select id, name, slug from organizations`,
    );
    const org = orgs.rows.find((o) => o.slug === target || o.id === target);
    if (!org) {
      throw new Error(
        `Fandt ingen organisation "${target}". Kendte: ${orgs.rows.map((o) => o.slug).join(", ")}`,
      );
    }

    console.log(`Organisation: ${org.name} (${org.slug})\n`);
    let total = 0;
    for (const table of TABLES) {
      const { rows } = await pool.query<{ n: number }>(
        `select count(*)::int as n from ${table} where org_id = $1`,
        [org.id],
      );
      const n = rows[0]?.n ?? 0;
      total += n;
      if (n > 0) console.log(`  ${String(n).padStart(5)}  ${table}`);
    }
    console.log(`\n  ${total} rækker i alt.`);
    console.log("  Beholdes: organisationen, brugere, firmaprofil, logo, API-nøgler, audit-log.");

    if (!confirmed) {
      console.log("\nIntet slettet. Kør igen med --confirm hvis det er det du vil.");
      return;
    }
    if (total === 0) {
      console.log("\nIngenting at slette.");
      return;
    }

    // Typing the slug is the last gate: --confirm alone is too easy to
    // paste from a terminal history into the wrong organization.
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`\nSkriv "${org.slug}" for at slette: `);
    rl.close();
    if (answer.trim() !== org.slug) {
      console.log("Afbrudt, intet er slettet.");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      // Turns off the immutability and audit triggers for this session
      // only. Superuser-only, and the reason this is a maintenance script
      // rather than anything the application can reach.
      await client.query("set local session_replication_role = replica");
      for (const table of TABLES) {
        await client.query(`delete from ${table} where org_id = $1`, [org.id]);
      }
      await client.query("set local session_replication_role = origin");
      await client.query(
        `insert into audit_log (org_id, actor_type, action, entity_type, entity_id, after_data)
           values ($1, 'system', 'organization.reset', 'organization', $1, $2)`,
        [org.id, JSON.stringify({ rowsDeleted: total, tables: TABLES })],
      );
      await client.query("commit");
      console.log(`\n${total} rækker slettet. Fakturatælleren starter forfra på 1.`);
      console.log("Kør scripts/onboard-vinther.ts igen for at lægge opsætningen tilbage.");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nFejlede:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
