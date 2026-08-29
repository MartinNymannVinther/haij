// Loaded before anything touches @/core/env: a standalone script gets no
// help from Next.js, which normally reads .env for us.
import "dotenv/config";

import { createInterface } from "node:readline/promises";
import { Pool } from "pg";

/**
 * Removes one invoice completely, including its lines, and releases the
 * hours it covered back to unbilled. For testing.
 *
 *     pnpm script scripts/delete-invoice.ts <org> <nummer>            # viser hvad der ryger
 *     pnpm script scripts/delete-invoice.ts <org> <nummer> --confirm  # sletter
 *
 * Deliberately a script and not a button. An issued invoice is immutable
 * and undeletable inside the application, enforced by database triggers,
 * because bogføringsloven wants an unbroken number sequence and a
 * deleted invoice leaves a hole nobody can explain years later. The right
 * answer against real books is a credit note. This exists so trying
 * things out during setup does not require softening that rule — it runs
 * as the migration role, outside the app, and switches the guards off for
 * the length of one transaction.
 *
 * When the deleted invoice held the highest number, the counter is wound
 * back so the number is handed out again. That is what you want in a
 * test and precisely what you must never do to real books.
 */

const confirmed = process.argv.includes("--confirm");
const target = process.argv[2];
const numberArg = process.argv[3];

type InvoiceRow = {
  id: string;
  invoice_number: number | null;
  invoice_date: string | null;
  status: string;
  gross_oere: string;
  buyer_name: string | null;
};

async function main() {
  if (!target || target.startsWith("--") || !numberArg || numberArg.startsWith("--")) {
    throw new Error(
      "Brug: pnpm script scripts/delete-invoice.ts <org-slug> <fakturanummer> [--confirm]",
    );
  }
  const invoiceNumber = Number(numberArg);
  if (!Number.isInteger(invoiceNumber) || invoiceNumber < 1) {
    throw new Error(`"${numberArg}" er ikke et fakturanummer.`);
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

    const { rows } = await pool.query<InvoiceRow>(
      `select id, invoice_number, invoice_date::text as invoice_date, status, gross_oere, buyer_name
         from invoices where org_id = $1 and invoice_number = $2`,
      [org.id, invoiceNumber],
    );
    const invoice = rows[0];
    if (!invoice) {
      throw new Error(`${org.slug} har ingen faktura nummer ${invoiceNumber}.`);
    }

    const [{ rows: lineRows }, { rows: entryRows }, { rows: counterRows }] = await Promise.all([
      pool.query<{ n: number }>(
        `select count(*)::int as n from invoice_lines where invoice_id = $1`,
        [invoice.id],
      ),
      pool.query<{ n: number; minutes: number }>(
        `select count(*)::int as n, coalesce(sum(t.duration_minutes), 0)::int as minutes
           from time_entries t
           join invoice_lines l on l.id = t.invoice_line_id
          where l.invoice_id = $1`,
        [invoice.id],
      ),
      pool.query<{ next_number: number }>(
        `select next_number from invoice_counters where org_id = $1`,
        [org.id],
      ),
    ]);

    const lines = lineRows[0]?.n ?? 0;
    const entries = entryRows[0]?.n ?? 0;
    const minutes = entryRows[0]?.minutes ?? 0;
    const counter = counterRows[0]?.next_number ?? 1;
    const rewind = counter === invoiceNumber + 1;

    console.log(`Organisation: ${org.name} (${org.slug})\n`);
    console.log(
      `  Faktura ${invoiceNumber} · ${invoice.invoice_date ?? "uden dato"} · ${invoice.status}`,
    );
    console.log(
      `  ${invoice.buyer_name ?? "uden kunde"} · ${(Number(invoice.gross_oere) / 100).toLocaleString("da-DK")} kr. inkl. moms`,
    );
    console.log(`  ${lines} ${lines === 1 ? "linje" : "linjer"}`);
    console.log(
      `  ${entries} ${entries === 1 ? "tidspost" : "tidsposter"} (${(minutes / 60).toFixed(1)} timer) bliver ufaktureret igen`,
    );
    console.log(
      rewind
        ? `  Fakturatælleren rulles tilbage til ${invoiceNumber}, så nummeret bruges igen.`
        : `  Fakturatælleren står på ${counter} og røres ikke. Nummer ${invoiceNumber} bliver et hul i rækken.`,
    );

    if (!confirmed) {
      console.log("\nIntet slettet. Kør igen med --confirm hvis det er det du vil.");
      return;
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`\nSkriv "${invoiceNumber}" for at slette: `);
    rl.close();
    if (answer.trim() !== String(invoiceNumber)) {
      console.log("Afbrudt, intet er slettet.");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      // Session-local, so a crash cannot leave the guards off. It also
      // suspends foreign-key cascades, which is why the children below
      // are cleared by hand rather than left to ON DELETE.
      await client.query("set local session_replication_role = replica");
      await client.query(
        `update time_entries set invoice_line_id = null, updated_at = now()
           where invoice_line_id in (select id from invoice_lines where invoice_id = $1)`,
        [invoice.id],
      );
      await client.query(`delete from invoice_lines where invoice_id = $1`, [invoice.id]);
      await client.query(`delete from invoices where id = $1`, [invoice.id]);
      if (rewind) {
        await client.query(`update invoice_counters set next_number = $2 where org_id = $1`, [
          org.id,
          invoiceNumber,
        ]);
      }
      await client.query("set local session_replication_role = origin");
      await client.query(
        `insert into audit_log (org_id, actor_type, action, entity_type, entity_id, before_data)
           values ($1, 'system', 'invoices.purged', 'invoice', $2, $3)`,
        [
          org.id,
          invoice.id,
          JSON.stringify({
            invoiceNumber,
            invoiceDate: invoice.invoice_date,
            status: invoice.status,
            grossOere: Number(invoice.gross_oere),
            linesDeleted: lines,
            timeEntriesReleased: entries,
            counterRewound: rewind,
          }),
        ],
      );
      await client.query("commit");
      console.log(`\nFaktura ${invoiceNumber} er slettet.`);
      if (entries > 0) {
        console.log(`${(minutes / 60).toFixed(1)} timer er ufakturerede igen.`);
      }
      if (rewind) console.log(`Næste faktura får nummer ${invoiceNumber} igen.`);
      console.log("Handlingen står i audit-loggen som 'invoices.purged'.");
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
